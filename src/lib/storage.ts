import { supabase } from './supabase';
import { MAX_ATTACHMENT_SIZE_BYTES, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export type AttachmentBucket = 'avatars' | 'attachments';

export class AttachmentTooLargeError extends Error {}
export class AttachmentTypeError extends Error {}

// Anything explicitly disallowed for security reasons (executables, scripts).
const BLOCKED_MIME_PATTERNS = [/^application\/x-msdownload$/, /^application\/x-sh$/, /^text\/x-sh$/];

export interface UploadResult {
  url: string;
  path: string;
  name: string;
  size: number;
  mime: string;
}

// Split out so callers that want to fail fast — before creating an optimistic
// message that would otherwise sit there with a useless "retry" button for
// an error retrying can't fix — can validate synchronously up front.
export function validateAttachment(file: File): void {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AttachmentTooLargeError(
      `Файл слишком большой (макс. ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024)} МБ)`,
    );
  }
  if (BLOCKED_MIME_PATTERNS.some((re) => re.test(file.type))) {
    throw new AttachmentTypeError('Этот тип файла запрещён');
  }
}

// supabase-js's storage client uploads via fetch(), which has no upload
// progress event in any browser. XHR's upload.onprogress is the only way to
// report real (not simulated) progress, so we hit the Storage REST endpoint
// directly here, replicating exactly what the SDK sends (same URL shape,
// same multipart body, same auth headers via the current session).
function uploadViaXhr(
  bucket: AttachmentBucket,
  path: string,
  file: File,
  accessToken: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Ошибка загрузки (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Ошибка сети при загрузке'));
    xhr.onabort = () => reject(new Error('Загрузка отменена'));

    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);
    xhr.send(form);
  });
}

export async function uploadAttachment(
  bucket: AttachmentBucket,
  userId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  validateAttachment(file);

  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const path = `${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? SUPABASE_ANON_KEY;

  await uploadViaXhr(bucket, path, file, accessToken, onProgress);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    url: data.publicUrl,
    path,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
  };
}
