// Verifies message reactions end-to-end against real schema+RLS: react,
// replace-with-different-emoji, remove, visibility for chat members, and
// that a non-member can't react.
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
    email: `react${suffix}+${stamp}@example.com`,
    password: 'SmokeTest123!',
  });
  if (error) throw error;
  if (!su.session) throw new Error('no session — email confirmation still ON');
  const username = `react_${suffix}_${stamp}`;
  await client.from('profiles').insert({ id: su.user.id, username, display_name: `React Tester ${suffix}` });
  return { client, id: su.user.id };
}

const a = await makeUser('a');
const b = await makeUser('b');
const outsider = await makeUser('outsider');

const { data: chat, error: e1 } = await a.client
  .from('chats')
  .insert({ type: 'direct', created_by: a.id })
  .select('id')
  .single();
check('create chat', !e1 && !!chat, e1?.message);

await a.client.from('chat_members').insert([
  { chat_id: chat.id, user_id: a.id, role: 'owner' },
  { chat_id: chat.id, user_id: b.id, role: 'member' },
]);

const { data: msg, error: e2 } = await a.client
  .from('messages')
  .insert({ chat_id: chat.id, sender_id: a.id, type: 'text', content: 'react to this', client_id: crypto.randomUUID() })
  .select('*')
  .single();
check('A sends message', !e2 && !!msg, e2?.message);

// 1. B reacts with 👍
const { error: e3 } = await b.client
  .from('message_reactions')
  .upsert({ message_id: msg.id, user_id: b.id, emoji: '👍' }, { onConflict: 'message_id,user_id' });
check('B reacts with 👍', !e3, e3?.message);

// 2. A can see B's reaction (RLS select for chat members)
const { data: seenByA, error: e4 } = await a.client
  .from('message_reactions')
  .select('*')
  .eq('message_id', msg.id);
check('A sees the reaction', !e4 && seenByA?.length === 1 && seenByA[0].emoji === '👍', e4?.message);

// 3. B changes their reaction to ❤️ (one reaction per user per message)
const { error: e5 } = await b.client
  .from('message_reactions')
  .upsert({ message_id: msg.id, user_id: b.id, emoji: '❤️' }, { onConflict: 'message_id,user_id' });
const { data: afterChange } = await a.client.from('message_reactions').select('*').eq('message_id', msg.id);
check(
  'B changing emoji replaces (not adds) the row',
  !e5 && afterChange?.length === 1 && afterChange[0].emoji === '❤️',
  e5?.message,
);

// 4. B removes their reaction
const { error: e6 } = await b.client.from('message_reactions').delete().eq('message_id', msg.id).eq('user_id', b.id);
const { data: afterRemove } = await a.client.from('message_reactions').select('*').eq('message_id', msg.id);
check('B removes reaction', !e6 && afterRemove?.length === 0, e6?.message);

// 5. Outsider (not a chat member) cannot react — RLS insert check fails
const { error: e7 } = await outsider.client
  .from('message_reactions')
  .insert({ message_id: msg.id, user_id: outsider.id, emoji: '😂' });
check('outsider cannot react to a chat they are not in', !!e7);

console.log(allOk ? '\nAll reaction checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
