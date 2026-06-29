import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  if (!existsSync(envPath)) throw new Error('.env.local not found');
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const env = loadEnvLocal();
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const stamp = Date.now();

const { data: su, error: e1 } = await client.auth.signUp({
  email: `msgtype+${stamp}@example.com`,
  password: 'SmokeTest123!',
});
if (e1) throw e1;
if (!su.session) throw new Error('no session — email confirmation still ON');

await client.from('profiles').insert({ id: su.user.id, username: `mt_${stamp}`, display_name: 'MT' });

const { data: chat, error: e2 } = await client
  .from('chats')
  .insert({ type: 'direct', created_by: su.user.id })
  .select('id')
  .single();
if (e2) throw e2;
await client.from('chat_members').insert({ chat_id: chat.id, user_id: su.user.id, role: 'owner' });

let allOk = true;
for (const type of ['voice', 'video_note']) {
  const { error } = await client.from('messages').insert({
    chat_id: chat.id,
    sender_id: su.user.id,
    type,
    client_id: crypto.randomUUID(),
    attachment_url: 'https://example.com/x',
    attachment_meta: { duration: 5 },
  });
  console.log(type, error ? `FAIL: ${error.message}` : 'OK');
  if (error) allOk = false;
}

process.exit(allOk ? 0 : 1);
