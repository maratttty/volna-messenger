import { useRef } from 'react';
import { Paperclip, Reply, Pencil, Trash2, Forward, Pin, PinOff, Copy, Check, CheckCheck, X, Clock, AlertCircle, RotateCw } from 'lucide-react';
import type { Message, MessageStatusValue, ReactionSummary, Profile } from '../../types/database';
import { formatMessageTime } from '../../lib/time';
import { AudioPlayer } from './AudioPlayer';
import { VideoNotePlayer } from './VideoNotePlayer';
import { CircularProgressRing } from '../ui/CircularProgressRing';
import { useContextMenu } from '../../hooks/useContextMenu';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { useUploadProgressStore } from '../../store/upload-progress-store';
import { useSendStatusStore } from '../../store/send-status-store';
import { retryFailedItem, deleteOutboxItem } from '../../lib/outbox';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  status?: MessageStatusValue;
  senderName?: string;
  senderProfile?: Profile;
  onOpenProfile?: (profile: Profile) => void;
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
  if (status === 'read') return <CheckCheck size={13} className="shrink-0 text-accent" />;
  if (status === 'delivered') return <CheckCheck size={13} className="shrink-0 opacity-50" />;
  return <Check size={13} className="shrink-0 opacity-50" />;
}

function formatBytes(size?: number): string {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

// Ring + centered cancel (X) button, shared by the photo/file overlays below
// — tapping it aborts the in-flight XHR (see upload-progress-store.ts).
function UploadCancelButton({
  progress,
  size,
  onCancel,
}: {
  progress: number;
  size: number;
  onCancel: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
      aria-label="Отменить загрузку"
      className="relative flex items-center justify-center rounded-full"
      style={{ width: size, height: size }}
    >
      <CircularProgressRing progress={progress} size={size} strokeWidth={3} className="text-white" trackClassName="text-white/30" smooth spinning />
      <X size={Math.round(size * 0.45)} className="text-white" />
    </button>
  );
}

function MessageContent({
  message,
  senderName,
  uploadProgress,
  onCancelUpload,
}: {
  message: Message;
  senderName?: string;
  uploadProgress?: number;
  onCancelUpload?: () => void;
}) {
  if (message.deleted) {
    return <p className="text-sm italic text-text-muted">Сообщение удалено</p>;
  }

  const uploading = uploadProgress !== undefined && uploadProgress < 1;

  switch (message.type) {
    case 'image': {
      const img = (
        <img
          src={message.attachment_url ?? ''}
          alt={message.attachment_meta?.name ?? 'изображение'}
          className="max-h-72 max-w-full rounded-lg object-cover"
        />
      );
      if (uploading && onCancelUpload) {
        return (
          <div className="relative">
            {img}
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
              <UploadCancelButton progress={uploadProgress} size={44} onCancel={onCancelUpload} />
            </div>
          </div>
        );
      }
      return (
        <a href={message.attachment_url ?? '#'} target="_blank" rel="noopener noreferrer">
          {img}
        </a>
      );
    }

    case 'file': {
      const icon =
        uploading && onCancelUpload ? (
          <UploadCancelButton progress={uploadProgress} size={36} onCancel={onCancelUpload} />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Paperclip size={20} />
          </div>
        );
      const inner = (
        <>
          {icon}
          <div className="min-w-0">
            <p className="truncate text-sm">{message.attachment_meta?.name ?? 'Файл'}</p>
            <p className="text-xs text-text-muted">
              {uploading ? `${Math.round(uploadProgress * 100)}%` : formatBytes(message.attachment_meta?.size)}
            </p>
          </div>
        </>
      );
      if (uploading && onCancelUpload) {
        return <div className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-2">{inner}</div>;
      }
      return (
        <a
          href={message.attachment_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-2 hover:bg-black/20"
        >
          {inner}
        </a>
      );
    }

    case 'voice':
      return (
        <AudioPlayer
          src={message.attachment_url ?? ''}
          duration={message.attachment_meta?.duration}
          messageId={message.id}
          senderName={senderName ?? ''}
          uploadProgress={uploadProgress}
          onCancelUpload={onCancelUpload}
        />
      );

    case 'video_note':
      return (
        <VideoNotePlayer
          src={message.attachment_url ?? ''}
          durationSeconds={message.attachment_meta?.duration}
          messageId={message.id}
          senderName={senderName ?? ''}
          posterUrl={message.attachment_meta?.posterUrl}
          uploadProgress={uploadProgress}
          onCancelUpload={onCancelUpload}
        />
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
  senderProfile,
  onOpenProfile,
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
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rawUploadProgress = useUploadProgressStore((s) =>
    message.client_id ? s.progress[message.client_id] : undefined,
  );
  const sendStatus = useSendStatusStore((s) =>
    message.client_id ? s.status[message.client_id] : undefined,
  );

  if (message.type === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-surface px-3 py-1 text-xs text-text-muted">{message.content}</span>
      </div>
    );
  }

  const isPending = message.id.startsWith('pending-');
  // Gate on isPending too: once the message is confirmed, hide the ring
  // immediately even if the store's clearProgress() call hasn't landed yet.
  const uploadProgress = isPending ? rawUploadProgress : undefined;
  const onCancelUpload =
    isPending && message.client_id
      ? () => useUploadProgressStore.getState().cancelUpload(message.client_id!)
      : undefined;
  const isVideoNote = message.type === 'video_note';
  const isMedia = message.type === 'image' || message.type === 'file' || message.type === 'voice' || isVideoNote;
  // Media bubbles never dim while pending — the upload ring+X is the only
  // "in flight" indicator (Telegram-style). Text stays dimmed like before.
  const showPendingDim = isPending && !isMedia;
  const canEdit = isOwn && message.type === 'text' && !message.deleted;
  const canCopy = message.type === 'text' && !message.deleted && !!message.content;
  const canActOn = !message.deleted && !isPending;
  const isQueued = !!message.client_id && sendStatus === 'queued';
  const isFailed = !!message.client_id && sendStatus === 'failed';
  const canRetryOrDelete = isQueued || isFailed;

  const menuItems: ContextMenuItem[] = canActOn
    ? [
        { label: 'Ответить',    icon: Reply,   onClick: () => onReply(message) },
        { label: 'Переслать',   icon: Forward, onClick: () => onForward(message) },
        ...(canCopy ? [{ label: 'Копировать', icon: Copy, onClick: () => { void navigator.clipboard.writeText(message.content!); } }] : []),
        ...(canEdit ? [{ label: 'Редактировать', icon: Pencil, onClick: () => onEdit(message) }] : []),
        isPinned
          ? { label: 'Открепить', icon: PinOff, onClick: onTogglePin }
          : { label: 'Закрепить', icon: Pin,    onClick: onTogglePin },
        { label: 'Удалить', icon: Trash2, onClick: () => onDelete(message), danger: true as const },
      ]
    : canRetryOrDelete
    ? [
        { label: 'Отправить заново', icon: RotateCw, onClick: () => void retryFailedItem(message.client_id!) },
        { label: 'Удалить', icon: Trash2, onClick: () => void deleteOutboxItem(message.client_id!, message), danger: true as const },
      ]
    : [];

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-3 py-0.5`}>
      <div
        ref={bubbleRef}
        {...(canActOn || canRetryOrDelete ? menu.triggerProps : {})}
        className={
          isVideoNote
            ? `select-none flex flex-col items-${isOwn ? 'end' : 'start'} ${showPendingDim ? 'opacity-60' : ''}`
            : `select-none max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-bubble-out text-text' : 'bg-bubble-in text-text'} ${showPendingDim ? 'opacity-60' : ''}`
        }
      >
        {message.forwarded_from_name && (
          <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-accent">
            <Forward size={12} /> от {message.forwarded_from_name}
          </p>
        )}
        {!isOwn && senderName && !isVideoNote && (
          senderProfile && onOpenProfile ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfile(senderProfile);
              }}
              className="mb-0.5 block text-xs font-medium text-accent hover:underline"
            >
              {senderName}
            </button>
          ) : (
            <p className="mb-0.5 text-xs font-medium text-accent">{senderName}</p>
          )
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
        <MessageContent message={message} senderName={senderName} uploadProgress={uploadProgress} onCancelUpload={onCancelUpload} />
        {reactions && reactions.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${isVideoNote ? 'px-1' : ''}`}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReaction(r.emoji);
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                  r.reactedByMe
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-black/10 text-text-muted hover:bg-black/20'
                }`}
              >
                <span className="text-2xl leading-none">{r.emoji}</span>
                <span className="text-sm font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] text-text-muted ${isVideoNote ? 'px-1' : ''}`}>
          {message.edited_at && <span>изменено</span>}
          <span>{formatMessageTime(message.created_at)}</span>
          {isOwn && !isPending && <StatusTicks status={status} />}
          {isOwn && isQueued && <Clock size={12} className="shrink-0 opacity-50" />}
          {isOwn && isFailed && <AlertCircle size={12} className="shrink-0 text-red-500" />}
        </div>
      </div>
      {menu.position && bubbleRef.current && (
        <ContextMenu
          anchorRect={bubbleRef.current.getBoundingClientRect()}
          items={menuItems}
          onClose={menu.close}
          quickReactions={canActOn ? QUICK_REACTIONS : undefined}
          onQuickReact={onToggleReaction}
        />
      )}
    </div>
  );
}
