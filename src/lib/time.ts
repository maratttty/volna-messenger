// Compact relative time for chat list / message timestamps (ru locale)
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = diffMs / 60_000;

  if (diffMin < 1) return 'сейчас';
  if (diffMin < 60) return `${Math.floor(diffMin)} мин`;

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'вчера';

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatLastSeen(lastSeenAt: string | undefined): string | null {
  if (!lastSeenAt) return null;
  const date = new Date(lastSeenAt);
  const now = new Date();
  const diffMin = (now.getTime() - date.getTime()) / 60_000;

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${Math.floor(diffMin)} мин назад`;

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `сегодня в ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `вчера в ${time}`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Compact "date, time" for search results, where results can span many days
// and both pieces of information matter (unlike the chat list's relative time).
export function formatSearchResultTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `вчера, ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = date.toLocaleDateString(
    'ru-RU',
    sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
  return `${datePart}, ${time}`;
}
