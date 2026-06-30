import type { Message } from '../types/database';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : 'denied';
}

// Must be called from a direct user gesture (button click) — Chrome silently
// suppresses the native prompt for permission requests it doesn't attribute
// to user activation (its "quiet UI" heuristic for un-engaged sites), which
// would otherwise leave the permission stuck on 'default' forever with no
// visible prompt at all.
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Some browsers (older Safari) only support the callback form.
    return Notification.permission;
  }
}

function previewText(message: Message): string {
  if (message.deleted) return 'Сообщение удалено';
  switch (message.type) {
    case 'image':
      return '📷 Фото';
    case 'file':
      return `📎 ${message.attachment_meta?.name ?? 'Файл'}`;
    case 'voice':
      return '🎤 Голосовое сообщение';
    case 'video_note':
      return '📹 Видео-сообщение';
    default:
      return message.content ?? '';
  }
}

// Fired for an incoming message in a chat that isn't both muted and visible.
// Clicking the notification focuses the tab and switches to that chat.
export function showMessageNotification(params: { title: string; message: Message; onClick: () => void }): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  const notification = new Notification(params.title, {
    body: previewText(params.message),
    icon: '/favicon.svg',
    tag: params.message.chat_id, // collapses rapid-fire messages from the same chat into one
  });
  notification.onclick = () => {
    window.focus();
    params.onClick();
    notification.close();
  };
}
