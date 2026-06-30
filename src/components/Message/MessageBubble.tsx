import { Paperclip, Reply, Pencil, Trash2, Forward, Pin, PinOff } from 'lucide-react';
import type { Message, MessageStatusValue, ReactionSummary } from '../../types/database';
import { formatMessageTime } from '../../lib/time';
import { AudioPlayer } from './AudioPlayer';
import { VideoNotePlayer } from './VideoNotePlayer';
import { useContextMenu } from '../../hooks/useContextMenu';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  status?: MessageStatusValue;
  senderName?: string;
  repliedMessage?: Message;
  repliedSenderName?: string;
  reactions?: ReactionSummary[];
  isPinned: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onForward: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
  onToggleReaction: (emoji: string) => void;
  onTogglePin: () => void;
}

function StatusTicks({ status }: { status?: MessageStatusValue }) {
  if (!status) return <span className="ml-1 text-[10px] opacity-60">✓</span>; // sent, not yet delivered
  if (status === 'delivered') return <span className="ml-1 text-[10px] opacity-60">✓✓</span>;
  return <span className="ml-1 text-[10px] text-accent">✓✓</span>; // read
}

function formatBytes(size?: number): string {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function MessageContent({ message }: { message: Message }) {
  if (message.deleted) {
    return <p className="text-sm italic text-text-muted">Сообщение удалено</p>;
  }

  switch (message.type) {
    case 'image':
      return (
        <a href={message.attachment_url ?? '#'} target="_blank" rel="noopener noreferrer">
          <img
            src={message.attachment_url ?? ''}
            alt={message.attachment_meta?.name ?? 'изображение'}
            className="max-h-72 max-w-full rounded-lg object-cover"
          />
        </a>
      );

    case 'file':
      return (
        <a
          href={message.attachment_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-2 hover:bg-black/20"
        >
          <Paperclip size={20} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm">{message.attachment_meta?.name ?? 'Файл'}</p>
            <p className="text-xs text-text-muted">{formatBytes(message.attachment_meta?.size)}</p>
          </div>
        </a>
      );

    case 'voice':
      return (
        <AudioPlayer src={message.attachment_url ?? ''} duration={message.attachment_meta?.duration} />
      );

    case 'video_note':
      return (
        <VideoNotePlayer src={message.attachment_url ?? ''} durationSeconds={message.attachment_meta?.duration} />
      );

    default:
      return <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>;
  }
}

function repliedPreviewText(message?: Message): string {
  if (!message) return 'Сообщение';
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

export function MessageBubble({
  message,
  isOwn,
  status,
  senderName,
  repliedMessage,
  repliedSenderName,
  reactions,
  isPinned,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onJumpToMessage,
  onToggleReaction,
  onTogglePin,
}: MessageBubbleProps) {
  const menu = useContextMenu();

  if (message.type === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-surface px-3 py-1 text-xs text-text-muted">{message.content}</span>
      </div>
    );
  }

  const isPending = message.id.startsWith('pending-');
  const isVideoNote = message.type === 'video_note';
  const canEdit = isOwn && message.type === 'text' && !message.deleted;
  const canActOn = !message.deleted && !isPending;

  const menuItems: ContextMenuItem[] = canActOn
    ? [
        { label: 'Ответить', icon: Reply, onClick: () => onReply(message) },
        ...(canEdit ? [{ label: 'Редактировать', icon: Pencil, onClick: () => onEdit(message) }] : []),
        { label: 'Переслать', icon: Forward, onClick: () => onForward(message) },
        isPinned
          ? { label: 'Открепить', icon: PinOff, onClick: onTogglePin }
          : { label: 'Закрепить', icon: Pin, onClick: onTogglePin },
        { label: 'Удалить', icon: Trash2, onClick: () => onDelete(message), danger: true },
      ]
    : [];

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-3 py-0.5`}>
      <div
        {...(canActOn ? menu.triggerProps : {})}
        className={
          isVideoNote
            ? `flex flex-col items-${isOwn ? 'end' : 'start'} ${isPending ? 'opacity-60' : ''}`
            : `max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-bubble-out text-text' : 'bg-bubble-in text-text'} ${isPending ? 'opacity-60' : ''}`
        }
      >
        {message.forwarded_from_name && (
          <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-accent">
            <Forward size={12} /> от {message.forwarded_from_name}
          </p>
        )}
        {!isOwn && senderName && !isVideoNote && (
          <p className="mb-0.5 text-xs font-medium text-accent">{senderName}</p>
        )}
        {message.reply_to_id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToMessage(message.reply_to_id!);
            }}
            className="mb-1 block w-full rounded border-l-2 border-accent bg-black/10 px-2 py-1 text-left transition hover:bg-black/20"
          >
            <p className="truncate text-xs font-medium text-accent">{repliedSenderName ?? 'Сообщение'}</p>
            <p className="truncate text-xs text-text-muted">{repliedPreviewText(repliedMessage)}</p>
          </button>
        )}
        <MessageContent message={message} />
        {reactions && reactions.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${isVideoNote ? 'px-1' : ''}`}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReaction(r.emoji);
                }}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
                  r.reactedByMe
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-black/10 text-text-muted hover:bg-black/20'
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] text-text-muted ${isVideoNote ? 'px-1' : ''}`}>
          {message.edited_at && <span>изменено</span>}
          <span>{formatMessageTime(message.created_at)}</span>
          {isOwn && !isPending && <StatusTicks status={status} />}
        </div>
      </div>
      {menu.position && (
        <ContextMenu
          x={menu.position.x}
          y={menu.position.y}
          items={menuItems}
          onClose={menu.close}
          quickReactions={canActOn ? QUICK_REACTIONS : undefined}
          onQuickReact={onToggleReaction}
        />
      )}
    </div>
  );
}
