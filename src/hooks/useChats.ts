import { useEffect, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchChats } from '../lib/chats';
import { markMessageDelivered } from '../lib/messages';
import { showMessageNotification } from '../lib/notifications';
import { onNetworkRecovery } from '../lib/network';
import { useChatStore } from '../store/chat-store';
import { useAuth } from '../contexts/AuthContext';
import type { Chat, ChatWithMeta, Message } from '../types/database';

// Suppressed only when this exact chat is both the open one AND the tab is
// actually visible — a background tab on the active chat still needs to alert.
function shouldNotify(chat: ChatWithMeta, message: Message, userId: string): boolean {
  if (message.sender_id === userId || chat.muted) return false;
  const isFocusedOnThisChat = useChatStore.getState().activeChatId === chat.id && !document.hidden;
  return !isFocusedOnThisChat;
}

export function useChats() {
  const { session } = useAuth();
  const { chats, setChats, upsertChat, patchChat } = useChatStore();
  const [loading, setLoading] = useState(true);
  const userId = session?.user.id;

  const reload = useCallback(async () => {
    if (!userId) return;
    const data = await fetchChats(userId);
    setChats(data);
  }, [userId, setChats]);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    void reload().finally(() => setLoading(false));

    let everConnected = false;

    // Realtime: listen for new/updated messages in any of the user's chats.
    // When something changes we re-fetch only the affected chat so the list
    // stays live without polling.
    // Unique-per-mount topic name — see useMessages.ts for why (StrictMode).
    const channel = supabase
      .channel(`chats:user:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          // Re-fetch all chats (cheap: only called on actual new messages)
          // A more surgical approach (upsert one chat) is an optimisation for later.
          const fresh = await fetchChats(userId);
          const updated = fresh.find((c) => c.id === newMessage.chat_id);
          if (updated) {
            upsertChat(updated);
            // Mark "delivered" as soon as it reaches any open client of ours,
            // regardless of whether that chat is the one currently open.
            if (newMessage.sender_id !== userId) {
              void markMessageDelivered(newMessage.id, userId);
            }
            if (shouldNotify(updated, newMessage, userId)) {
              const title = updated.type === 'direct' ? updated.otherUser?.display_name ?? 'Сообщение' : updated.title ?? 'Группа';
              showMessageNotification({
                title,
                message: newMessage,
                onClick: () => useChatStore.getState().setActiveChatId(updated.id),
              });
            }
          } else {
            void reload(); // chat membership changed
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats' },
        (payload) => {
          // Title/avatar/pin changes — only meaningful if it's a chat we
          // already have loaded (no chat_id filter is possible server-side
          // here, so just no-op for chats outside this user's list).
          const row = payload.new as Chat;
          if (useChatStore.getState().chats.some((c) => c.id === row.id)) {
            patchChat(row.id, {
              title: row.title,
              avatar_url: row.avatar_url,
              pinned_message_id: row.pinned_message_id,
            });
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_members',
          filter: `user_id=eq.${userId}`,
        },
        () => void reload(), // added to a new group
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_members',
          filter: `user_id=eq.${userId}`,
        },
        () => void reload(), // removed from a group
      )
      .subscribe((status) => {
        // Skip the initial SUBSCRIBED (already covered by the reload() call
        // above) — only re-sync on a SUBSCRIBED that follows a drop, since
        // postgres_changes doesn't replay whatever happened while disconnected.
        if (status === 'SUBSCRIBED' && everConnected) void reload();
        if (status === 'SUBSCRIBED') everConnected = true;
      });

    const stopWatchingRecovery = onNetworkRecovery(() => void reload());

    return () => {
      stopWatchingRecovery();
      void supabase.removeChannel(channel);
    };
  }, [userId, reload, upsertChat, patchChat]);

  return { chats, reload, loading };
}
