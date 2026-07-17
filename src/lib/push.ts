import { supabase } from './supabase';
import { VAPID_PUBLIC_KEY } from '../config';

// Web Push subscribe/unsubscribe — stage 1 of push notifications. No sending
// happens here or anywhere yet; this only gets a subscription saved to
// push_subscriptions so a later Edge Function has something to send to.

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// iOS Safari only exposes the Push API to installed (home-screen, standalone)
// PWAs — in a regular browser tab `PushManager` is simply undefined there.
// isPushSupported() already reflects that via feature detection, but the UI
// wants to tell these two "unsupported" cases apart with different copy.
export function isIosNonStandalone(): boolean {
  return isIos() && !isStandalone();
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios-needs-install' | 'denied' | 'dismissed' | 'error' };

export async function subscribeToPush(userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: isIosNonStandalone() ? 'ios-needs-install' : 'unsupported' };
  }

  // Browsers never re-prompt once denied — asking again would just silently
  // no-op at best. Surface the "enable it in browser settings" case instead
  // of calling requestPermission() pointlessly.
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'denied' };
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
    }
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    // Idempotent: reuse an existing subscription instead of creating a
    // second one if the user toggles this on again (e.g. after a reload).
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's lib.dom currently types applicationServerKey against
        // Uint8Array<ArrayBuffer> specifically, while a plain `new
        // Uint8Array(n)` infers Uint8Array<ArrayBufferLike> — same runtime
        // shape, just a lib.dom typing mismatch. BufferSource is what the
        // API actually accepts.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Некорректная push-подписка');
    }

    // One row per user — upsert on user_id keeps re-subscribing idempotent
    // (see supabase/add_push_subscriptions.sql for the multi-device caveat).
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (isPushSupported()) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      // Best-effort — still clear the DB row below regardless, so a stuck
      // browser-side unsubscribe doesn't leave a stale row behind forever.
    }
  }
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);
}
