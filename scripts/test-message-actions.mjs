// Verifies reply / edit / delete / forward end-to-end against the real
// schema+RLS (catches the "forwarded_from_id column missing" class of error
// before asking the user to retest manually in the browser).
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
let allOk = true;

function check(label, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) allOk = false;
}

const { data: su, error: e1 } = await client.auth.signUp({
  email: `fwd+${stamp}@example.com`,
  password: 'SmokeTest123!',
});
if (e1) throw e1;
if (!su.session) throw new Error('no session — email confirmation still ON');
const userId = su.user.id;

const { error: e2 } = await client
  .from('profiles')
  .insert({ id: userId, username: `fwd_${stamp}`, display_name: 'Forward Tester' });
if (e2) throw e2;

const { data: chat1, error: e3 } = await client
  .from('chats')
  .insert({ type: 'direct', created_by: userId })
  .select('id')
  .single();
if (e3) throw e3;
await client.from('chat_members').insert({ chat_id: chat1.id, user_id: userId, role: 'owner' });

const { data: chat2, error: e4 } = await client
  .from('chats')
  .insert({ type: 'direct', created_by: userId })
  .select('id')
  .single();
if (e4) throw e4;
await client.from('chat_members').insert({ chat_id: chat2.id, user_id: userId, role: 'owner' });

// 1. Base message to reply to / edit / delete
const { data: original, error: e5 } = await client
  .from('messages')
  .insert({ chat_id: chat1.id, sender_id: userId, type: 'text', content: 'original', client_id: crypto.randomUUID() })
  .select('*')
  .single();
check('insert original message', !e5, e5?.message);

// 2. Reply
const { data: replyMsg, error: e6 } = await client
  .from('messages')
  .insert({
    chat_id: chat1.id,
    sender_id: userId,
    type: 'text',
    content: 'a reply',
    client_id: crypto.randomUUID(),
    reply_to_id: original?.id,
  })
  .select('*')
  .single();
check('insert reply (reply_to_id)', !e6 && replyMsg?.reply_to_id === original?.id, e6?.message);

// 3. Edit
const { data: edited, error: e7 } = await client
  .from('messages')
  .update({ content: 'edited content', edited_at: new Date().toISOString() })
  .eq('id', original?.id)
  .select('*')
  .single();
check('edit message', !e7 && edited?.content === 'edited content' && !!edited?.edited_at, e7?.message);

// 4. Forward into chat2 — the column this whole check exists for.
const { data: forwarded, error: e8 } = await client
  .from('messages')
  .insert({
    chat_id: chat2.id,
    sender_id: userId,
    type: 'text',
    content: edited?.content,
    client_id: crypto.randomUUID(),
    forwarded_from_id: userId,
    forwarded_from_name: 'Forward Tester',
  })
  .select('*')
  .single();
check(
  'forward message (forwarded_from_id/name columns)',
  !e8 && forwarded?.forwarded_from_id === userId && forwarded?.forwarded_from_name === 'Forward Tester',
  e8?.message,
);

// 5. Delete (soft)
const { data: deleted, error: e9 } = await client
  .from('messages')
  .update({ deleted: true, content: null, attachment_url: null })
  .eq('id', replyMsg?.id)
  .select('*')
  .single();
check('soft-delete message', !e9 && deleted?.deleted === true && deleted?.content === null, e9?.message);

console.log(allOk ? '\nAll message-action checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
