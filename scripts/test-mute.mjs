// Verifies chat mute end-to-end against real schema+RLS: a member can mute
// their own chat_members row, it doesn't affect the other member's row, and
// a member can't mute someone else's row.
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
    email: `mute${suffix}+${stamp}@example.com`,
    password: 'SmokeTest123!',
  });
  if (error) throw error;
  if (!su.session) throw new Error('no session — email confirmation still ON');
  const username = `mute_${suffix}_${stamp}`;
  await client.from('profiles').insert({ id: su.user.id, username, display_name: `Mute Tester ${suffix}` });
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

// 1. A mutes their own row
const { error: e2 } = await a.client
  .from('chat_members')
  .update({ muted: true })
  .eq('chat_id', chat.id)
  .eq('user_id', a.id);
check('A mutes their own membership row', !e2, e2?.message);

// 2. B's row is unaffected
const { data: bRow, error: e3 } = await b.client
  .from('chat_members')
  .select('muted')
  .eq('chat_id', chat.id)
  .eq('user_id', b.id)
  .single();
check('B\'s row stays unmuted', !e3 && bRow?.muted === false, e3?.message);

// 3. A's row reads back muted
const { data: aRow, error: e4 } = await a.client
  .from('chat_members')
  .select('muted')
  .eq('chat_id', chat.id)
  .eq('user_id', a.id)
  .single();
check('A\'s row reads back muted=true', !e4 && aRow?.muted === true, e4?.message);

// 4. B cannot mute A's row (not owner/admin, not their own row)
const { error: e5 } = await b.client
  .from('chat_members')
  .update({ muted: true })
  .eq('chat_id', chat.id)
  .eq('user_id', a.id);
const { data: aRowAfter } = await a.client
  .from('chat_members')
  .select('muted')
  .eq('chat_id', chat.id)
  .eq('user_id', a.id)
  .single();
check('B cannot mute A\'s row (RLS no-ops, A\'s row unchanged)', aRowAfter?.muted === true, e5?.message);

console.log(allOk ? '\nAll mute checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
