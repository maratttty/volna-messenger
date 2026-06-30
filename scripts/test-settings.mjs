// Verifies profile editing and group title/avatar editing end-to-end against
// real schema+RLS: a user can update their own profile, a group admin can
// rename/re-avatar the group, but a plain member cannot.
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
    email: `set${suffix}+${stamp}@example.com`,
    password: 'SmokeTest123!',
  });
  if (error) throw error;
  if (!su.session) throw new Error('no session — email confirmation still ON');
  const username = `set_${suffix}_${stamp}`;
  await client.from('profiles').insert({ id: su.user.id, username, display_name: `Settings Tester ${suffix}` });
  return { client, id: su.user.id, username };
}

const owner = await makeUser('owner');
const member = await makeUser('member');

// 1. Profile self-edit
const { error: e1 } = await owner.client
  .from('profiles')
  .update({ display_name: 'Renamed Owner', bio: 'hello' })
  .eq('id', owner.id);
const { data: ownProfile, error: e2 } = await owner.client
  .from('profiles')
  .select('display_name, bio')
  .eq('id', owner.id)
  .single();
check(
  'user edits their own profile',
  !e1 && !e2 && ownProfile?.display_name === 'Renamed Owner' && ownProfile?.bio === 'hello',
  e1?.message ?? e2?.message,
);

// 2. Username uniqueness still enforced (taking someone else's username fails)
const { error: e3 } = await owner.client.from('profiles').update({ username: member.username }).eq('id', owner.id);
check('cannot steal another user\'s username (unique constraint)', !!e3);

// 3. Group setup
const { data: chat, error: e4 } = await owner.client
  .from('chats')
  .insert({ type: 'group', title: 'Original Title', created_by: owner.id })
  .select('id')
  .single();
check('create group', !e4 && !!chat, e4?.message);

await owner.client.from('chat_members').insert([
  { chat_id: chat.id, user_id: owner.id, role: 'owner' },
  { chat_id: chat.id, user_id: member.id, role: 'member' },
]);

// 4. Owner renames the group
const { error: e5 } = await owner.client
  .from('chats')
  .update({ title: 'Renamed Group', avatar_url: 'https://example.com/avatar.png' })
  .eq('id', chat.id);
const { data: renamed, error: e6 } = await owner.client.from('chats').select('title, avatar_url').eq('id', chat.id).single();
check(
  'owner renames group + sets avatar',
  !e5 && !e6 && renamed?.title === 'Renamed Group' && renamed?.avatar_url === 'https://example.com/avatar.png',
  e5?.message ?? e6?.message,
);

// 5. Plain member cannot rename the group (RLS: only owner/admin)
const { error: e7 } = await member.client.from('chats').update({ title: 'Hijacked' }).eq('id', chat.id);
const { data: stillRenamed } = await owner.client.from('chats').select('title').eq('id', chat.id).single();
check('member cannot rename group (RLS no-ops, title unchanged)', stillRenamed?.title === 'Renamed Group', e7?.message);

console.log(allOk ? '\nAll settings checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
