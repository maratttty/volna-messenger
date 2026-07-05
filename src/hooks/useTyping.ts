import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ActivityType = 'typing' | 'recording_voice' | 'recording_video';
type ActivityPayload = ActivityType | 'stop';

const ACTIVITY_TTL_MS = 5000;
const ACTIVITY_REPEAT_MS = 3000;

export interface ActivityInfo {
  displayName: string;
  activity: ActivityType;
}

export function useTyping(chatId: string | null, userId: string | undefined, displayName: string | undefined) {
  const [activityUsers, setActivityUsers] = useState<Map<string, ActivityInfo>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setActivityUsers(new Map());
    if (!chatId || !userId) return;

    const channel = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'activity' }, (payload) => {
        const { userId: fromId, displayName: fromName, activity } = payload.payload as {
          userId: string;
          displayName: string;
          activity: ActivityPayload;
        };
        if (fromId === userId) return;

        if (activity === 'stop') {
          const t = clearTimers.current.get(fromId);
          if (t) clearTimeout(t);
          clearTimers.current.delete(fromId);
          setActivityUsers((prev) => {
            if (!prev.has(fromId)) return prev;
            const next = new Map(prev);
            next.delete(fromId);
            return next;
          });
          return;
        }

        setActivityUsers((prev) => {
          const next = new Map(prev);
          next.set(fromId, { displayName: fromName, activity });
          return next;
        });

        const existing = clearTimers.current.get(fromId);
        if (existing) clearTimeout(existing);
        clearTimers.current.set(
          fromId,
          setTimeout(() => {
            setActivityUsers((prev) => {
              const next = new Map(prev);
              next.delete(fromId);
              return next;
            });
          }, ACTIVITY_TTL_MS),
        );
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      for (const t of clearTimers.current.values()) clearTimeout(t);
      clearTimers.current.clear();
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chatId, userId]);

  const sendActivity = useCallback((activity: ActivityPayload) => {
    if (!channelRef.current || !userId || !displayName) return;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'activity',
      payload: { userId, displayName, activity },
    });
  }, [userId, displayName]);

  // One-shot typing signal (called on each keystroke, throttled by caller)
  const notifyTyping = useCallback(() => {
    if (activityIntervalRef.current) {
      clearInterval(activityIntervalRef.current);
      activityIntervalRef.current = null;
    }
    sendActivity('typing');
  }, [sendActivity]);

  // Starts broadcasting a recording activity (repeats every ACTIVITY_REPEAT_MS)
  const notifyActivity = useCallback((type: ActivityType) => {
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    sendActivity(type);
    activityIntervalRef.current = setInterval(() => sendActivity(type), ACTIVITY_REPEAT_MS);
  }, [sendActivity]);

  // Immediately clears any activity broadcast on other side
  const notifyActivityStop = useCallback(() => {
    if (activityIntervalRef.current) {
      clearInterval(activityIntervalRef.current);
      activityIntervalRef.current = null;
    }
    sendActivity('stop');
  }, [sendActivity]);

  return { activityUsers, notifyTyping, notifyActivity, notifyActivityStop };
}
