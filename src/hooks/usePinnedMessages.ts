import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchPins, pinMessage as doPin, unpinMessage as doUnpin } from '../lib/messages';
import type { PinEntry } from '../types/database';

export function usePinnedMessages(chatId: string) {
  const [pins, setPins] = useState<PinEntry[]>([]);

  const reload = useCallback(async () => {
    try {
      const entries = await fetchPins(chatId);
      setPins(entries);
    } catch {
      // non-critical
    }
  }, [chatId]);

  useEffect(() => {
    setPins([]);
    void reload();

    const channel = supabase
      .channel(`pins:${chatId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pins', filter: `chat_id=eq.${chatId}` }, () => void reload())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pins', filter: `chat_id=eq.${chatId}` }, () => void reload())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [chatId, reload]);

  const pinMessage = useCallback(async (messageId: string, isPersonal: boolean) => {
    await doPin(chatId, messageId, isPersonal);
    // realtime INSERT triggers reload
  }, [chatId]);

  const unpinMessage = useCallback(async (messageId: string, isPersonal: boolean) => {
    setPins((prev) => prev.filter((p) => !(p.messageId === messageId && p.isPersonal === isPersonal)));
    await doUnpin(chatId, messageId, isPersonal);
  }, [chatId]);

  return { pins, pinMessage, unpinMessage };
}
