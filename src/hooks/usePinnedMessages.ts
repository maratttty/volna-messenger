import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchPinnedMessages, pinMessageMulti, unpinMessageMulti } from '../lib/messages';
import type { Message } from '../types/database';

export function usePinnedMessages(chatId: string) {
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  const reload = useCallback(async () => {
    try {
      const msgs = await fetchPinnedMessages(chatId);
      setPinnedMessages(msgs);
    } catch {
      // ignore — non-critical
    }
  }, [chatId]);

  useEffect(() => {
    setPinnedMessages([]);
    void reload();

    const channel = supabase
      .channel(`pinned:${chatId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pinned_messages', filter: `chat_id=eq.${chatId}` }, () => void reload())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pinned_messages', filter: `chat_id=eq.${chatId}` }, () => void reload())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [chatId, reload]);

  const pinMessage = useCallback(async (messageId: string) => {
    await pinMessageMulti(chatId, messageId);
    // reload() will fire via realtime
  }, [chatId]);

  const unpinMessage = useCallback(async (messageId: string) => {
    // Optimistic: remove locally immediately
    setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
    await unpinMessageMulti(chatId, messageId);
  }, [chatId]);

  return { pinnedMessages, pinMessage, unpinMessage };
}
