import { useEffect, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchChats } from '../lib/chats';
import { markMessageDelivered } from '../lib/messages';
import { useChatStore } from '../store/chat-store';
import { useAuth } from '../contexts/AuthContext';
import type { Message } from '../types/database';

export function useChats() {
  const { session } = useAuth();
  const { chats, setChats, upsertChat } = useChatStore();
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
          } else {
            void reload(); // chat membership changed
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, reload, upsertChat]);

  return { chats, reload, loading };
}
