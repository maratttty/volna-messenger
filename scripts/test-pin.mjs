// Verifies pin/unpin end-to-end against the real RPCs + RLS: any chat member
// can pin (including the non-creator side of a direct chat, which only holds
// the 'member' role), it's visible to the other side, only a member can pin,
// and unpin clears it back to null.
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
    email: `pin${suffix}+${stamp}@example.com`,
    password: 'SmokeTest123!',
  });
  if (error) throw error;
  if (!su.session) throw new Error('no session — email confirmation still ON');
  const username = `pin_${suffix}_${stamp}`;
  await client.from('profiles').insert({ id: su.user.id, username, display_name: `Pin Tester ${suffix}` });
  return { client, id: su.user.id };
}

const a = await makeUser('a'); // creator → role 'owner' in this direct chat
const b = await makeUser('b'); // role 'member'
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
  .insert({ chat_id: chat.id, sender_id: a.id, type: 'text', content: 'pin me', client_id: crypto.randomUUID() })
  .select('*')
  .single();
check('A sends message', !e2 && !!msg, e2?.message);

// 1. B (plain 'member', not owner/admin) can pin — this is the whole point
// of going through the RPC instead of the owner/admin-only chats UPDATE policy.
const { error: e3 } = await b.client.rpc('pin_message', { p_chat_id: chat.id, p_message_id: msg.id });
check('B (role=member) can pin a message', !e3, e3?.message);

// 2. A sees the pin
const { data: afterPin, error: e4 } = await a.client.from('chats').select('pinned_message_id').eq('id', chat.id).single();
check('A sees the pinned message id', !e4 && afterPin?.pinned_message_id === msg.id, e4?.message);

// 3. Outsider (not a member) cannot pin
const { error: e5 } = await outsider.client.rpc('pin_message', { p_chat_id: chat.id, p_message_id: msg.id });
check('outsider cannot pin (not a member)', !!e5);

// 4. Pinning a message that doesn't belong to this chat is rejected
const { data: otherChat } = await a.client.from('chats').insert({ type: 'direct', created_by: a.id }).select('id').single();
await a.client.from('chat_members').insert({ chat_id: otherChat.id, user_id: a.id, role: 'owner' });
const { error: e6 } = await a.client.rpc('pin_message', { p_chat_id: otherChat.id, p_message_id: msg.id });
check('cannot pin a message from a different chat', !!e6);

// 5. A unpins
const { error: e7 } = await a.client.rpc('unpin_message', { p_chat_id: chat.id });
const { data: afterUnpin } = await b.client.from('chats').select('pinned_message_id').eq('id', chat.id).single();
check('unpin clears it back to null', !e7 && afterUnpin?.pinned_message_id === null, e7?.message);

console.log(allOk ? '\nAll pin checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
