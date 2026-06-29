import { supabase } from './supabase';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../config';

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

export async function uploadAttachment(
  bucket: AttachmentBucket,
  userId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AttachmentTooLargeError(
      `Файл слишком большой (макс. ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024)} МБ)`,
    );
  }
  if (BLOCKED_MIME_PATTERNS.some((re) => re.test(file.type))) {
    throw new AttachmentTypeError('Этот тип файла запрещён');
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const path = `${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    url: data.publicUrl,
    path,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
  };
}
