import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { Paperclip, Send, Pencil, Reply, Smile, X } from 'lucide-react';
import { MAX_MESSAGE_LENGTH } from '../../config';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import { RecordButton, CANCEL_THRESHOLD_PX } from './RecordButton';
import { RecordingBar } from './RecordingBar';
import { VideoNoteOverlay } from './VideoNoteOverlay';
import { EmojiGifPicker } from './EmojiGifPicker';
import type { GifResult } from '../../lib/giphy';
import type { Message } from '../../types/database';

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;
  onSendVoice: (blob: Blob, durationSeconds: number) => Promise<void>;
  onSendVideoNote: (blob: Blob, durationSeconds: number, mimeType: string) => Promise<void>;
  onSendGif: (gifUrl: string, title: string) => Promise<void>;
  onTyping: () => void;
  replyTarget: Message | null;
  onCancelReply: () => void;
  editingMessage: Message | null;
  onCancelEdit: () => void;
  onSaveEdit: (content: string) => Promise<void>;
  resolveSenderName: (senderId: string | null) => string;
}

export function MessageInput({
  onSend,
  onSendFile,
  onSendVoice,
  onSendVideoNote,
  onSendGif,
  onTyping,
  replyTarget,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onSaveEdit,
  resolveSenderName,
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'voice' | 'video'>('voice');
  const [cancelProgress, setCancelProgress] = useState(0);
  const [locked, setLocked] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastTypingNotify = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const audio = useAudioRecorder();
  const video = useVideoRecorder();
  const active = mode === 'voice' ? audio : video;

  // Wire auto-stop (max duration reached) to the same finishRecording path
  // as a normal release. Use a ref so the callbacks always see latest state.
  const finishRecordingRef = useRef<() => Promise<void>>();
  useEffect(() => {
    audio.onMaxDurationRef.current = () => finishRecordingRef.current?.() ?? Promise.resolve();
    video.onMaxDurationRef.current = () => finishRecordingRef.current?.() ?? Promise.resolve();
  });

  // Pre-fills the textarea when an edit starts, and clears it again when the
  // edit ends (saved or canceled) — both collapse to editingMessage becoming null.
  useEffect(() => {
    setValue(editingMessage?.content ?? '');
  }, [editingMessage?.id]);

  function handleChange(e: { target: { value: string } }) {
    setValue(e.target.value);
    const now = Date.now();
    if (now - lastTypingNotify.current > 1500) {
      lastTypingNotify.current = now;
      onTyping();
    }
  }

  async function handleSend() {
    const content = value.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      if (editingMessage) {
        await onSaveEdit(content);
      } else {
        setValue('');
        await onSend(content);
      }
    } catch (err) {
      if (editingMessage) {
        setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
      } else {
        setValue(content);
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      await onSendFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить файл');
    }
  }

  // Inserts at the cursor (not just appended) so picking an emoji mid-sentence
  // lands where the user was typing, then restores focus + caret position.
  function handleSelectEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function handleSelectGif(gif: GifResult) {
    setPickerOpen(false);
    setError(null);
    try {
      await onSendGif(gif.fullUrl, gif.title);
    } catch {
      setError('Не удалось отправить GIF');
    }
  }

  async function handleHoldStart() {
    setError(null);
    setCancelProgress(0);
    await active.start();
  }

  function handleHoldMove(deltaX: number) {
    const progress = Math.min(1, Math.max(0, -deltaX / CANCEL_THRESHOLD_PX));
    setCancelProgress(progress);
  }

  async function finishRecording() {
    if (mode === 'voice') {
      const result = await audio.stop();
      if (!result) return;
      if (result.durationSeconds < 0.5) {
        setError('Запись слишком короткая — удерживайте кнопку дольше');
        return;
      }
      try {
        await onSendVoice(result.blob, result.durationSeconds);
      } catch {
        setError('Не удалось отправить голосовое сообщение');
      }
    } else {
      const result = await video.stop();
      if (!result) return;
      if (result.durationSeconds < 0.5) {
        setError('Запись слишком короткая — удерживайте кнопку дольше');
        return;
      }
      try {
        await onSendVideoNote(result.blob, result.durationSeconds, result.mimeType);
      } catch {
        setError('Не удалось отправить видео-кружок');
      }
    }
    setLocked(false);
  }

  // Keep the ref up to date every render so auto-stop always calls
  // the latest version of finishRecording (with correct mode in closure).
  finishRecordingRef.current = finishRecording;

  async function handleHoldEnd(canceled: boolean) {
    setCancelProgress(0);
    if (canceled) {
      active.cancel();
      return;
    }
    await finishRecording();
  }

  function handleLock() {
    setCancelProgress(0);
    setLocked(true);
  }

  async function handleSendLocked() {
    await finishRecording();
    setLocked(false);
  }

  function handleCancelLocked() {
    active.cancel();
    setLocked(false);
  }

  const isRecording = active.isRecording;
  const isVideoRecording = mode === 'video' && isRecording;

  return (
    <div className="pb-safe relative border-t border-border bg-surface px-3 py-3">
      {/* Full-screen overlay during video-note recording */}
      {isVideoRecording && (
        <VideoNoteOverlay
          stream={video.stream}
          elapsedSeconds={video.elapsedSeconds}
          maxDurationSeconds={video.maxDurationSeconds}
          cancelProgress={cancelProgress}
          locked={locked}
          onCancel={() => { active.cancel(); setLocked(false); }}
          onCancelLocked={handleCancelLocked}
          onSendLocked={() => void handleSendLocked()}
        />
      )}
      {pickerOpen && (
        <EmojiGifPicker
          onSelectEmoji={handleSelectEmoji}
          onSelectGif={(gif) => void handleSelectGif(gif)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {(error || audio.error || video.error) && (
        <p className="mb-2 text-xs text-red-400">{error ?? audio.error ?? video.error}</p>
      )}

      {editingMessage && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg px-3 py-2">
          <Pencil size={16} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-accent">Редактирование</p>
            <p className="truncate text-xs text-text-muted">{editingMessage.content}</p>
          </div>
          <button
            onClick={onCancelEdit}
            className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface-hover hover:text-text"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {!editingMessage && replyTarget && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg px-3 py-2">
          <Reply size={16} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-accent">{resolveSenderName(replyTarget.sender_id)}</p>
            <p className="truncate text-xs text-text-muted">
              {replyTarget.deleted ? 'Сообщение удалено' : replyTarget.content ?? 'Сообщение'}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface-hover hover:text-text"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {!isRecording && !editingMessage && (
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleFileChange(e)} />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Прикрепить файл"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-hover hover:text-text"
            >
              <Paperclip size={20} />
            </button>
            <button
              onClick={() => setPickerOpen((open) => !open)}
              title="Эмодзи и GIF"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-hover ${
                pickerOpen ? 'text-accent' : 'text-text-muted hover:text-text'
              }`}
            >
              <Smile size={20} />
            </button>
          </>
        )}

        {isRecording && !isVideoRecording ? (
          // Voice recording: show waveform bar inline
          <div className="flex-1 overflow-hidden">
            <RecordingBar
              mode="voice"
              elapsedSeconds={audio.elapsedSeconds}
              maxDurationSeconds={audio.maxDurationSeconds}
              cancelProgress={cancelProgress}
              locked={locked}
              onCancelLocked={handleCancelLocked}
              audioStream={audio.stream}
              videoStream={null}
            />
          </div>
        ) : isVideoRecording ? (
          // Video recording: the overlay covers the screen; show a minimal
          // placeholder so the RecordButton stays in place for gesture capture.
          <div className="flex-1" />
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение…"
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            autoFocus={!!editingMessage}
            className="max-h-32 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}

        {!isRecording && (editingMessage || value.trim()) ? (
          <button
            onClick={() => void handleSend()}
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition hover:bg-accent-hover disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        ) : (
          // Kept mounted across the whole idle → recording → idle cycle: this
          // is the SAME button instance that received pointerdown, so its
          // internal hold/gesture state survives the start/stop transition.
          <RecordButton
            mode={mode}
            locked={locked}
            onToggleMode={() => setMode((m) => (m === 'voice' ? 'video' : 'voice'))}
            onHoldStart={handleHoldStart}
            onHoldMove={handleHoldMove}
            onHoldEnd={(canceled) => void handleHoldEnd(canceled)}
            onLock={handleLock}
            onSendLocked={() => void handleSendLocked()}
          />
        )}
      </div>
    </div>
  );
}
