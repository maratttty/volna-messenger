import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchMessages,
  sendMessage as sendMessageApi,
  sendAttachmentMessage,
  sendGifMessage,
  editMessage,
  deleteMessage,
  hideMessageForMe,
  markChatRead,
  markMessageRead,
  updateReadCursor,
  fetchOwnMessageStatuses,
} from '../lib/messages';
import { uploadAttachment } from '../lib/storage';
import { onNetworkRecovery } from '../lib/network';
import { fetchReactions, groupReactions, setReaction, removeReaction } from '../lib/reactions';
import { useMessageStore } from '../store/message-store';
import { useChatStore } from '../store/chat-store';
import type { Message, MessageStatusValue, MessageType, ReactionSummary } from '../types/database';

export function useMessages(chatId: string | null, currentUserId: string | undefined, hiddenBeforeAt?: string | null) {
  const { messages, hasMore, setMessages, prependMessages, appendMessage, updateMessage, removeMessage } =
    useMessageStore();
  const chatMessages = chatId ? messages[chatId] ?? [] : [];
  const chatHasMore = chatId ? hasMore[chatId] ?? false : false;
  const [loading, setLoading] = useState(() => chatMessages.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchDone, setFetchDone] = useState(false);
  const [statuses, setStatuses] = useState<Map<string, MessageStatusValue>>(new Map());
  const [reactions, setReactions] = useState<Map<string, ReactionSummary[]>>(new Map());

  const refreshStatuses = useCallback(async (msgs: Message[]) => {
    if (!currentUserId) return;
    const ownIds = msgs.filter((m) => m.sender_id === currentUserId).map((m) => m.id);
    const map = await fetchOwnMessageStatuses(ownIds);
    setStatuses(map);
  }, [currentUserId]);

  const refreshReactions = useCallback(async (msgs: Message[]) => {
    if (!currentUserId || msgs.length === 0) return;
    const rows = await fetchReactions(msgs.map((m) => m.id));
    setReactions(groupReactions(rows, currentUserId));
  }, [currentUserId]);

  // A single reaction changed — cheaper than re-fetching the whole chat's
  // reactions, and correct even for messages outside the currently loaded page.
  const refreshReactionsForMessage = useCallback(
    async (messageId: string) => {
      if (!currentUserId) return;
      const rows = await fetchReactions([messageId]);
      const grouped = groupReactions(rows, currentUserId).get(messageId) ?? [];
      setReactions((prev) => {
        const next = new Map(prev);
        if (grouped.length === 0) next.delete(messageId);
        else next.set(messageId, grouped);
        return next;
      });
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!chatId || !currentUserId) return;
    let cancelled = false;

    setFetchDone(false);
    setLoading(true);
    fetchMessages(chatId, currentUserId, undefined, hiddenBeforeAt)
      .then(({ messages: page, hasMore: more }) => {
        if (cancelled) return;
        setMessages(chatId, page, more);
        setFetchDone(true);
        // Persist the read cursor immediately (one fast row update) so that the
        // correct position survives a page refresh even if markChatRead is slow.
        const lastMsg = page[page.length - 1];
        if (lastMsg) {
          void updateReadCursor(chatId, currentUserId, lastMsg.id);
          useChatStore.getState().markRead(chatId, lastMsg.id);
        }
        // Slow path: update individual message_status rows for ✓✓ sender receipts
        void markChatRead(chatId, currentUserId);
        void refreshStatuses(page);
        void refreshReactions(page);
      })
      .finally(() => !cancelled && setLoading(false));

    // Re-fetches the latest page and merges anything missing into the
    // already-loaded history (sorted, deduped) — postgres_changes doesn't
    // replay events missed while disconnected, so this is the only way to
    // catch up after a dropped connection.
    async function catchUp() {
      if (cancelled || !chatId || !currentUserId) return;
      const { messages: page } = await fetchMessages(chatId, currentUserId, undefined, hiddenBeforeAt);
      const existing = useMessageStore.getState().messages[chatId] ?? [];
      const merged = [...existing];
      for (const msg of page) {
        if (!merged.some((m) => m.id === msg.id)) merged.push(msg);
      }
      merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
      setMessages(chatId, merged, useMessageStore.getState().hasMore[chatId] ?? false);
      const lastMerged = merged[merged.length - 1];
      if (lastMerged) {
        void updateReadCursor(chatId, currentUserId, lastMerged.id);
        useChatStore.getState().markRead(chatId, lastMerged.id);
      }
      void markChatRead(chatId, currentUserId);
      void refreshStatuses(merged);
      void refreshReactions(merged);
    }

    let everConnected = false;

    // Unique-per-mount topic name: React StrictMode double-invokes effects in
    // dev (mount → cleanup → mount), and reusing the same topic name can race
    // with the in-flight removeChannel() from the first cleanup.
    const channel = supabase
      .channel(`messages:${chatId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const msg = payload.new as Message;
          appendMessage(chatId, msg);
          if (msg.sender_id !== currentUserId) {
            void markMessageRead(msg.id, currentUserId);
            // Persist cursor to DB so fetchChats reports the right count on refresh
            if (chatId) void updateReadCursor(chatId, currentUserId, msg.id);
            useChatStore.getState().markRead(chatId, msg.id);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const updated = payload.new as Message;
          // Deleted messages vanish entirely (Telegram-style), no "deleted" placeholder
          if (updated.deleted) {
            if (chatId) removeMessage(chatId, updated.id);
          } else {
            updateMessage(chatId, updated);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_status' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { message_id: string; status: MessageStatusValue } | null;
          if (!row) return;
          setStatuses((prev) => {
            const next = new Map(prev);
            const existing = next.get(row.message_id);
            if (!existing || row.status === 'read') next.set(row.message_id, row.status);
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { message_id: string } | null;
          if (!row) return;
          void refreshReactionsForMessage(row.message_id);
        },
      )
      .subscribe((status) => {
        // Skip the very first SUBSCRIBED (the initial fetch above already
        // covers it) — only catch up on a SUBSCRIBED that follows a drop.
        if (status === 'SUBSCRIBED' && everConnected) void catchUp();
        if (status === 'SUBSCRIBED') everConnected = true;
      });

    const stopWatchingRecovery = onNetworkRecovery(() => void catchUp());

    return () => {
      cancelled = true;
      stopWatchingRecovery();
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, currentUserId]);

  const loadMore = useCallback(async () => {
    if (!chatId || !currentUserId || loadingMore || !chatHasMore || chatMessages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = chatMessages[0].created_at;
      const { messages: page, hasMore: more } = await fetchMessages(chatId, currentUserId, oldest, hiddenBeforeAt);
      prependMessages(chatId, page, more);
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, currentUserId, chatHasMore, chatMessages, loadingMore, prependMessages, hiddenBeforeAt]);

  // Search results can point at messages older than what's currently paged
  // in. Reads the pagination cursor fresh from the store on every loop turn
  // (via getState()) instead of the memoized `loadMore` above, which closes
  // over a single render's `chatMessages` and would refetch the same page
  // forever if called repeatedly without a re-render in between.
  const ensureMessageLoaded = useCallback(
    async (messageId: string) => {
      if (!chatId || !currentUserId || loadingMore) return;
      if ((useMessageStore.getState().messages[chatId] ?? []).some((m) => m.id === messageId)) return;

      setLoadingMore(true);
      try {
        for (;;) {
          const current = useMessageStore.getState().messages[chatId] ?? [];
          if (current.some((m) => m.id === messageId)) return;
          if (!useMessageStore.getState().hasMore[chatId] || current.length === 0) return;

          const oldest = current[0].created_at;
          const { messages: page, hasMore: more } = await fetchMessages(chatId, currentUserId, oldest, hiddenBeforeAt);
          if (page.length === 0) return;
          prependMessages(chatId, page, more);
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [chatId, currentUserId, loadingMore, prependMessages, hiddenBeforeAt],
  );

  const pendingClientIds = useRef(new Set<string>());

  const send = useCallback(
    async (content: string, replyToId?: string | null) => {
      if (!chatId || !currentUserId) return;
      const clientId = crypto.randomUUID();
      pendingClientIds.current.add(clientId);

      const optimistic: Message = {
        id: `pending-${clientId}`,
        client_id: clientId,
        chat_id: chatId,
        sender_id: currentUserId,
        type: 'text',
        content,
        attachment_url: null,
        attachment_meta: null,
        reply_to_id: replyToId ?? null,
        forwarded_from_id: null,
        forwarded_from_name: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
      };
      appendMessage(chatId, optimistic);

      try {
        const confirmed = await sendMessageApi({ chatId, senderId: currentUserId, content, clientId, replyToId });
        useMessageStore.getState().confirmMessage(chatId, clientId, confirmed);
      } catch (err) {
        useMessageStore.getState().removeMessage(chatId, optimistic.id);
        throw err;
      } finally {
        pendingClientIds.current.delete(clientId);
      }
    },
    [chatId, currentUserId, appendMessage],
  );

  const sendAttachment = useCallback(
    async (file: File, type: MessageType, duration?: number, replyToId?: string | null) => {
      if (!chatId || !currentUserId) return;
      const clientId = crypto.randomUUID();
      const localUrl = URL.createObjectURL(file);

      const optimistic: Message = {
        id: `pending-${clientId}`,
        client_id: clientId,
        chat_id: chatId,
        sender_id: currentUserId,
        type,
        content: null,
        attachment_url: localUrl,
        attachment_meta: { name: file.name, size: file.size, mime: file.type, duration },
        reply_to_id: replyToId ?? null,
        forwarded_from_id: null,
        forwarded_from_name: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
      };
      appendMessage(chatId, optimistic);

      try {
        const uploaded = await uploadAttachment('attachments', currentUserId, file);
        const confirmed = await sendAttachmentMessage({
          chatId,
          senderId: currentUserId,
          clientId,
          type,
          upload: uploaded,
          duration,
          replyToId,
        });
        useMessageStore.getState().confirmMessage(chatId, clientId, confirmed);
      } catch (err) {
        useMessageStore.getState().removeMessage(chatId, optimistic.id);
        throw err;
      } finally {
        URL.revokeObjectURL(localUrl);
      }
    },
    [chatId, currentUserId, appendMessage],
  );

  const sendGif = useCallback(
    async (gifUrl: string, title: string, replyToId?: string | null) => {
      if (!chatId || !currentUserId) return;
      const clientId = crypto.randomUUID();

      const optimistic: Message = {
        id: `pending-${clientId}`,
        client_id: clientId,
        chat_id: chatId,
        sender_id: currentUserId,
        type: 'image',
        content: null,
        attachment_url: gifUrl,
        attachment_meta: { name: title, mime: 'image/gif' },
        reply_to_id: replyToId ?? null,
        forwarded_from_id: null,
        forwarded_from_name: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
      };
      appendMessage(chatId, optimistic);

      try {
        const confirmed = await sendGifMessage({ chatId, senderId: currentUserId, clientId, gifUrl, title, replyToId });
        useMessageStore.getState().confirmMessage(chatId, clientId, confirmed);
      } catch (err) {
        useMessageStore.getState().removeMessage(chatId, optimistic.id);
        throw err;
      }
    },
    [chatId, currentUserId, appendMessage],
  );

  const edit = useCallback(async (messageId: string, content: string) => {
    await editMessage(messageId, content);
  }, []);

  const remove = useCallback(async (messageId: string) => {
    if (!chatId) return;
    await deleteMessage(messageId);
    // Remove immediately from local store — don't wait for the realtime UPDATE
    useMessageStore.getState().removeMessage(chatId, messageId);
  }, [chatId]);

  // "Delete for me" — hides the message only in this user's view, no
  // realtime event involved (it's a private per-user list, not a row change
  // other members can see), so the store update has to happen locally here.
  const removeForMe = useCallback(
    async (messageId: string) => {
      if (!chatId || !currentUserId) return;
      await hideMessageForMe(messageId, chatId, currentUserId);
      useMessageStore.getState().removeMessage(chatId, messageId);
    },
    [chatId, currentUserId],
  );

  // Tapping the emoji you already reacted with removes it; tapping a
  // different one replaces it (one reaction per user per message). Updates
  // optimistically so the tap feels instant — the realtime listener above
  // reconciles with the server shortly after regardless.
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const current = reactions.get(messageId) ?? [];
      const mine = current.find((r) => r.reactedByMe);
      const isUnreact = mine?.emoji === emoji;

      setReactions((prev) => {
        const next = new Map(prev);
        const summaries = (next.get(messageId) ?? []).map((r) => ({ ...r }));
        if (mine) {
          const idx = summaries.findIndex((r) => r.emoji === mine.emoji);
          if (idx !== -1) {
            summaries[idx].count -= 1;
            summaries[idx].reactedByMe = false;
            if (summaries[idx].count <= 0) summaries.splice(idx, 1);
          }
        }
        if (!isUnreact) {
          const idx = summaries.findIndex((r) => r.emoji === emoji);
          if (idx !== -1) {
            summaries[idx].count += 1;
            summaries[idx].reactedByMe = true;
          } else {
            summaries.push({ emoji, count: 1, reactedByMe: true });
          }
        }
        next.set(messageId, summaries);
        return next;
      });

      try {
        if (isUnreact) await removeReaction(messageId, currentUserId);
        else await setReaction(messageId, currentUserId, emoji);
      } catch {
        void refreshReactionsForMessage(messageId);
      }
    },
    [currentUserId, reactions, refreshReactionsForMessage],
  );

  return {
    messages: chatMessages,
    hasMore: chatHasMore,
    loading,
    loadingMore,
    fetchDone,
    loadMore,
    ensureMessageLoaded,
    send,
    sendAttachment,
    sendGif,
    edit,
    remove,
    removeForMe,
    statuses,
    reactions,
    toggleReaction,
  };
}
