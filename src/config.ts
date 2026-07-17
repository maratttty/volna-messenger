// Central place for runtime configuration. The product name is intentionally
// a config value (env var with fallback) rather than hardcoded.
export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Freeword';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY ?? '';

// Web Push — public by design (sent as-is in every subscription request, not
// a secret). The matching private key lives only as a future Edge Function
// secret, never in frontend config.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

// Spec §5.6: server-enforced limits on message content and attachments.
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// Recording limits — separate from file size, since a long recording at low
// bitrate can be small but still impractical to send/listen to.
export const MAX_VOICE_DURATION_SECONDS = 5 * 60; // 5 minutes
export const MAX_VIDEO_NOTE_DURATION_SECONDS = 60;

// Spec §5.5: group size cap for the MVP.
export const MAX_GROUP_MEMBERS = 200;

// Stories are ephemeral for 24h, mirroring Telegram — but offered to everyone
// for free here, matching the brief ("бесплатные сторис как в Premium").
export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
