// Persistent outbox for messages that failed to send because of the network.
// Survives page reloads (IndexedDB, not localStorage — attachments are
// binary Files/Blobs) so a reconnect can pick up and finish the send even
// after the SW/browser reloaded the tab in between.
import type { Message, MessageType } from '../types/database';
import { sendMessage, sendAttachmentMessage, sendGifMessage } from './messages';
import { uploadAttachmentWithProgress, AttachmentTooLargeError, AttachmentTypeError } from './storage';
import { useMessageStore } from '../store/message-store';
import { useSendStatusStore } from '../store/send-status-store';
import { playSendSound } from './sound';

const DB_NAME = 'freeword-outbox';
const STORE = 'items';
const MAX_ATTEMPTS = 6;

type OutboxStatus = 'queued' | 'failed';

interface OutboxBase {
  clientId: string;
  chatId: string;
  senderId: string;
  replyToId: string | null;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
}

export type OutboxItem =
  | (OutboxBase & { kind: 'text'; content: string })
  | (OutboxBase & { kind: 'attachment'; messageType: MessageType; file: File; duration?: number; posterUrl?: string })
  | (OutboxBase & { kind: 'gif'; gifUrl: string; title: string });

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'clientId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putOutboxItem(item: OutboxItem): Promise<void> {
  await withStore('readwrite', (store) => store.put(item));
}

export async function removeOutboxItem(clientId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(clientId));
}

export async function getAllOutboxItems(): Promise<OutboxItem[]> {
  return withStore('readonly', (store) => store.getAll());
}

async function updateOutboxItem(clientId: string, patch: { status: OutboxStatus; attempts: number }): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(clientId);
    getReq.onsuccess = () => {
      const existing = getReq.result as OutboxItem | undefined;
      if (!existing) { resolve(); return; }
      const putReq = store.put({ ...existing, ...patch });
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function sendOutboxItem(item: OutboxItem): Promise<Message> {
  if (item.kind === 'text') {
    return sendMessage({ chatId: item.chatId, senderId: item.senderId, content: item.content, clientId: item.clientId, replyToId: item.replyToId });
  }
  if (item.kind === 'gif') {
    return sendGifMessage({ chatId: item.chatId, senderId: item.senderId, clientId: item.clientId, gifUrl: item.gifUrl, title: item.title, replyToId: item.replyToId });
  }
  const uploaded = await uploadAttachmentWithProgress('attachments', item.senderId, item.file, () => {});
  return sendAttachmentMessage({
    chatId: item.chatId,
    senderId: item.senderId,
    clientId: item.clientId,
    type: item.messageType,
    upload: uploaded,
    duration: item.duration,
    posterUrl: item.posterUrl,
    replyToId: item.replyToId,
  });
}

// Guards against the same item being retried twice concurrently (a manual
// "retry now" tap landing mid-way through an automatic backoff attempt).
const inFlight = new Set<string>();

async function retryItem(item: OutboxItem): Promise<boolean> {
  if (inFlight.has(item.clientId)) return false;
  inFlight.add(item.clientId);
  try {
    const confirmed = await sendOutboxItem(item);
    useMessageStore.getState().confirmMessage(item.chatId, item.clientId, confirmed);
    playSendSound();
    useSendStatusStore.getState().clearStatus(item.clientId);
    await removeOutboxItem(item.clientId);
    return true;
  } catch (err) {
    // Validation errors (file too big / blocked type) will never succeed on
    // retry — stop immediately instead of burning through attempts.
    const nonRetryable = err instanceof AttachmentTooLargeError || err instanceof AttachmentTypeError;
    const attempts = item.attempts + 1;
    const status: OutboxStatus = nonRetryable || attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
    await updateOutboxItem(item.clientId, { status, attempts });
    useSendStatusStore.getState().setStatus(item.clientId, status);
    return false;
  } finally {
    inFlight.delete(item.clientId);
  }
}

// Attempts every currently-queued item once. Returns true if at least one
// succeeded (the caller uses that to reset its backoff delay).
export async function processOutboxQueue(): Promise<boolean> {
  const items = (await getAllOutboxItems()).filter((i) => i.status === 'queued');
  if (items.length === 0) return false;
  const results = await Promise.all(items.map(retryItem));
  return results.some(Boolean);
}

export async function retryFailedItem(clientId: string): Promise<void> {
  await updateOutboxItem(clientId, { status: 'queued', attempts: 0 });
  useSendStatusStore.getState().setStatus(clientId, 'queued');
  void processOutboxQueue();
}

export async function deleteOutboxItem(clientId: string, message: Message): Promise<void> {
  await removeOutboxItem(clientId);
  useSendStatusStore.getState().clearStatus(clientId);
  useMessageStore.getState().removeMessage(message.chat_id, message.id);
  if (message.attachment_url?.startsWith('blob:')) URL.revokeObjectURL(message.attachment_url);
}

// Called once at app startup so failed/queued badges are correct immediately,
// before any chat has been opened (and thus before rehydrateOutboxIntoChat
// below has run for a given chat).
export async function hydrateSendStatusFromOutbox(): Promise<void> {
  const items = await getAllOutboxItems();
  for (const item of items) {
    useSendStatusStore.getState().setStatus(item.clientId, item.status);
  }
}

function outboxItemToMessage(item: OutboxItem): Message {
  const base = {
    id: `pending-${item.clientId}`,
    client_id: item.clientId,
    chat_id: item.chatId,
    sender_id: item.senderId,
    reply_to_id: item.replyToId,
    forwarded_from_id: null,
    forwarded_from_name: null,
    created_at: new Date(item.createdAt).toISOString(),
    edited_at: null,
    deleted: false,
  };
  if (item.kind === 'text') {
    return { ...base, type: 'text', content: item.content, attachment_url: null, attachment_meta: null };
  }
  if (item.kind === 'gif') {
    return { ...base, type: 'image', content: null, attachment_url: item.gifUrl, attachment_meta: { name: item.title, mime: 'image/gif' } };
  }
  return {
    ...base,
    type: item.messageType,
    content: null,
    // Regenerated on each load — the blob URL from the original tab session
    // is gone after a reload, but the File bytes themselves persisted fine.
    attachment_url: URL.createObjectURL(item.file),
    attachment_meta: {
      name: item.file.name,
      size: item.file.size,
      mime: item.file.type,
      duration: item.duration,
      posterUrl: item.posterUrl,
    },
  };
}

// Re-inserts any not-yet-sent messages for this chat into the message store
// — needed after a reload, since the store only ever holds what's been
// fetched from the server plus whatever was appended this session.
// appendMessage dedupes by client_id, so calling this on every chat open
// (even when nothing changed) is safe.
export async function rehydrateOutboxIntoChat(chatId: string): Promise<void> {
  const items = (await getAllOutboxItems()).filter((i) => i.chatId === chatId);
  for (const item of items) {
    useMessageStore.getState().appendMessage(chatId, outboxItemToMessage(item));
    useSendStatusStore.getState().setStatus(item.clientId, item.status);
  }
}
