import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const TYPING_TTL_MS = 4000;

// Ephemeral "is typing" signal via Realtime Broadcast — no DB writes, no
// persistence; just a low-latency fan-out to everyone else in the chat.
export function useTyping(chatId: string | null, userId: string | undefined, displayName: string | undefined) {
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map()); // userId -> displayName
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setTypingUsers(new Map());
    if (!chatId || !userId) return;

    // NOTE: unlike the postgres_changes channels in useMessages/useChats,
    // this topic name must stay identical across clients — broadcast only
    // relays between subscribers sharing the exact same topic.
    const channel = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId: fromId, displayName: fromName } = payload.payload as {
          userId: string;
          displayName: string;
        };
        if (fromId === userId) return;

        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(fromId, fromName);
          return next;
        });

        const existing = clearTimers.current.get(fromId);
        if (existing) clearTimeout(existing);
        clearTimers.current.set(
          fromId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(fromId);
              return next;
            });
          }, TYPING_TTL_MS),
        );
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      for (const t of clearTimers.current.values()) clearTimeout(t);
      clearTimers.current.clear();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chatId, userId]);

  const notifyTyping = useCallback(() => {
    if (!channelRef.current || !userId || !displayName) return;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, displayName },
    });
  }, [userId, displayName]);

  return { typingUsers, notifyTyping };
}
