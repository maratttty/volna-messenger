import { supabase } from './supabase';
import { MAX_ATTACHMENT_SIZE_BYTES, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export type AttachmentBucket = 'avatars' | 'attachments';

export class AttachmentTooLargeError extends Error {}
export class AttachmentTypeError extends Error {}
export class UploadCancelledError extends Error {}

// Anything explicitly disallowed for security reasons (executables, scripts).
const BLOCKED_MIME_PATTERNS = [/^application\/x-msdownload$/, /^application\/x-sh$/, /^text\/x-sh$/];

export interface UploadResult {
  url: string;
  path: string;
  name: string;
  size: number;
  mime: string;
}

function validateAttachment(file: File): void {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AttachmentTooLargeError(
      `Файл слишком большой (макс. ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024)} МБ)`,
    );
  }
  if (BLOCKED_MIME_PATTERNS.some((re) => re.test(file.type))) {
    throw new AttachmentTypeError('Этот тип файла запрещён');
  }
}

function buildAttachmentPath(userId: string, file: File): string {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  return `${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
}

function toUploadResult(bucket: AttachmentBucket, path: string, file: File): UploadResult {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    url: data.publicUrl,
    path,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
  };
}

export async function uploadAttachment(
  bucket: AttachmentBucket,
  userId: string,
  file: File,
): Promise<UploadResult> {
  validateAttachment(file);
  const path = buildAttachmentPath(userId, file);

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;

  return toUploadResult(bucket, path, file);
}

function parseStorageErrorMessage(responseText: string): string | null {
  try {
    const body = JSON.parse(responseText) as { message?: string; error?: string };
    return body.message ?? body.error ?? null;
  } catch {
    return null;
  }
}

// Same wire format as supabase-js's storage.upload() (FormData with an
// empty-string field name for the file body) — reproduced here only so we
// can use XMLHttpRequest instead of fetch, since fetch exposes no upload
// progress event in browsers. Used exclusively for the message-attachment
// send path (see useMessages.ts); avatar uploads keep using uploadAttachment
// above. If uploads start failing after a @supabase/supabase-js bump, check
// this function first — it mirrors an internal, undocumented contract.
export async function uploadAttachmentWithProgress(
  bucket: AttachmentBucket,
  userId: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  validateAttachment(file);
  const path = buildAttachmentPath(userId, file);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Не авторизован');

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(parseStorageErrorMessage(xhr.responseText) ?? `Ошибка загрузки (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Ошибка сети при загрузке файла'));
    xhr.onabort = () => reject(new UploadCancelledError('Загрузка отменена'));
    signal?.addEventListener('abort', () => xhr.abort());

    const formData = new FormData();
    formData.append('cacheControl', '3600');
    formData.append('', file);
    xhr.send(formData);
  });

  return toUploadResult(bucket, path, file);
}
