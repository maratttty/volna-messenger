/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa `injectManifest` strategy).
//
// This replaces the previously auto-generated `generateSW` output — that
// mode has no insertion point for custom code, so it couldn't host the push
// handlers below. Everything above the "push notifications" section below
// is a 1:1 reproduction of the old generateSW config (same precache globs,
// same navigateFallback + denylist, same skipWaiting/clientsClaim, same
// SKIP_WAITING postMessage handling for UpdateBanner.tsx) — nothing about
// caching or the offline message queue changes. The offline outbox itself
// (src/lib/outbox.ts) lives entirely outside the service worker (IndexedDB +
// a page-level JS retry loop), so it's untouched by this file either way.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// Precache manifest is injected here at build time by vite-plugin-pwa,
// generated from the same globPatterns the old generateSW config used.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Same SPA fallback + denylist as before — Supabase's own API/auth/storage
// paths must never resolve to index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//],
  }),
);

// UpdateBanner.tsx posts this after the user taps "Обновить" — unchanged.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push notifications (stage 1: scaffolding only) ──────────────────────
// Nothing sends a push yet — there's no server-side function for that. This
// listener exists so the receiving side is in place before that's built;
// it'll get exercised once the sending Edge Function ships.
self.addEventListener('push', (event: PushEvent) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Non-JSON payload — fall back to defaults below rather than throwing.
  }

  const title = payload.title ?? 'Freeword';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

// Focuses an already-open tab if there is one, otherwise opens a new one —
// standard pattern, same regardless of what stage 2 ends up sending.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => 'focus' in c);
      if (existing) {
        await (existing as WindowClient).focus();
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
