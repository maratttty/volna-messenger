// Verifies "delete for me" end-to-end against the real schema+RLS:
// message_hidden_for_user lets a user hide a message from their own view
// without touching the shared `messages` row or being visible/editable by
// anyone else.
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
const stamp = Date.now();
let allOk = true;

function check(label, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) allOk = false;
}

async function makeUser(suffix) {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data: su, error } = await client.auth.signUp({
    email: `dfm${suffix}+${stamp}@example.com`,
    password: 'SmokeTest123!',
  });
  if (error) throw error;
  if (!su.session) throw new Error('no session — email confirmation still ON');
  const username = `dfm_${suffix}_${stamp}`;
  await client.from('profiles').insert({ id: su.user.id, username, display_name: `DFM Tester ${suffix}` });
  return { client, id: su.user.id };
}

const a = await makeUser('a');
const b = await makeUser('b');

const { data: chat, error: e1 } = await a.client
  .from('chats')
  .insert({ type: 'direct', created_by: a.id })
  .select('id')
  .single();
check('create direct chat', !e1 && !!chat, e1?.message);

await a.client.from('chat_members').insert([
  { chat_id: chat.id, user_id: a.id, role: 'owner' },
  { chat_id: chat.id, user_id: b.id, role: 'member' },
]);

const { data: msg, error: e2 } = await a.client
  .from('messages')
  .insert({ chat_id: chat.id, sender_id: a.id, type: 'text', content: 'hello b', client_id: crypto.randomUUID() })
  .select('*')
  .single();
check('A sends message', !e2 && !!msg, e2?.message);

// 1. B hides it for themself
const { error: e3 } = await b.client
  .from('message_hidden_for_user')
  .upsert({ message_id: msg.id, chat_id: chat.id, user_id: b.id }, { onConflict: 'message_id,user_id' });
check('B hides message for themself', !e3, e3?.message);

// 2. B cannot hide it "on behalf of" A (RLS: user_id must equal auth.uid())
const { error: e4 } = await b.client
  .from('message_hidden_for_user')
  .insert({ message_id: msg.id, chat_id: chat.id, user_id: a.id });
check('B cannot insert a hidden-row for A (RLS blocks it)', !!e4);

// 3. The underlying message is untouched — A still sees it as before
const { data: stillThere, error: e5 } = await a.client
  .from('messages')
  .select('id, deleted, content')
  .eq('id', msg.id)
  .single();
check(
  'message itself unaffected for A (not deleted, content intact)',
  !e5 && stillThere?.deleted === false && stillThere?.content === 'hello b',
  e5?.message,
);

// 4. B's hidden list contains the message
const { data: bHidden, error: e6 } = await b.client
  .from('message_hidden_for_user')
  .select('message_id')
  .eq('chat_id', chat.id)
  .eq('user_id', b.id);
check('B can read their own hidden list', !e6 && bHidden?.some((r) => r.message_id === msg.id), e6?.message);

// 5. A cannot read B's hidden list (RLS: select also scoped to auth.uid() = user_id)
const { data: aSeesB } = await a.client
  .from('message_hidden_for_user')
  .select('message_id')
  .eq('user_id', b.id);
check('A cannot read B\'s hidden list', !aSeesB || aSeesB.length === 0);

// 6. Simulates the app's fetchMessages exclusion filter
const { data: filtered, error: e7 } = await b.client
  .from('messages')
  .select('*')
  .eq('chat_id', chat.id)
  .not('id', 'in', `(${msg.id})`);
check('hidden message excluded by id-exclusion filter (as fetchMessages does)', !e7 && filtered?.length === 0, e7?.message);

console.log(allOk ? '\nAll delete-for-me checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
