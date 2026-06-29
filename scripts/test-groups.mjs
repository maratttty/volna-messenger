// Verifies the groups feature end-to-end against real schema+RLS: create
// group, member list with profile join, role change, remove, invite link
// (create + reuse), join via invite, leave.
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
    email: `grp${suffix}+${stamp}@example.com`,
    password: 'SmokeTest123!',
  });
  if (error) throw error;
  if (!su.session) throw new Error('no session — email confirmation still ON');
  const username = `grp_${suffix}_${stamp}`;
  await client.from('profiles').insert({ id: su.user.id, username, display_name: `Group Tester ${suffix}` });
  return { client, id: su.user.id, username };
}

const owner = await makeUser('owner');
const memberA = await makeUser('a');
const memberB = await makeUser('b');
const joiner = await makeUser('joiner');

// 1. Create group (owner + memberA + memberB)
const { data: chat, error: e1 } = await owner.client
  .from('chats')
  .insert({ type: 'group', title: 'Test Group', created_by: owner.id })
  .select('id')
  .single();
check('create group chat', !e1 && !!chat, e1?.message);

const { error: e2 } = await owner.client.from('chat_members').insert([
  { chat_id: chat.id, user_id: owner.id, role: 'owner' },
  { chat_id: chat.id, user_id: memberA.id, role: 'member' },
  { chat_id: chat.id, user_id: memberB.id, role: 'member' },
]);
check('bootstrap-add 3 members as creator', !e2, e2?.message);

const { error: e3 } = await owner.client
  .from('messages')
  .insert({ chat_id: chat.id, sender_id: owner.id, type: 'system', content: 'Группа создана', client_id: crypto.randomUUID() });
check('post system message (group created)', !e3, e3?.message);

// 2. Member list with profile join
const { data: members, error: e4 } = await owner.client
  .from('chat_members')
  .select('*, profile:profiles(*)')
  .eq('chat_id', chat.id)
  .order('joined_at', { ascending: true });
check(
  'fetch members with profile join',
  !e4 && members?.length === 3 && members.every((m) => !!m.profile?.display_name),
  e4?.message ?? JSON.stringify(members?.map((m) => m.profile)),
);

// 3. Promote memberA to admin (as owner)
const { error: e5 } = await owner.client
  .from('chat_members')
  .update({ role: 'admin' })
  .eq('chat_id', chat.id)
  .eq('user_id', memberA.id);
check('owner promotes memberA to admin', !e5, e5?.message);

// 4. memberA (now admin) removes memberB
const { error: e6 } = await memberA.client
  .from('chat_members')
  .delete()
  .eq('chat_id', chat.id)
  .eq('user_id', memberB.id);
check('admin removes memberB', !e6, e6?.message);

// 5. memberB should no longer see the chat (RLS)
const { data: stillVisible } = await memberB.client.from('chats').select('id').eq('id', chat.id).maybeSingle();
check('removed member loses chat visibility', !stillVisible);

// 6. Invite link: create then reuse
const { data: invite1, error: e7 } = await owner.client
  .from('invites')
  .insert({ chat_id: chat.id, token: crypto.randomUUID().replace(/-/g, ''), created_by: owner.id })
  .select('token')
  .single();
check('create invite', !e7 && !!invite1?.token, e7?.message);

const { data: existing } = await owner.client
  .from('invites')
  .select('token')
  .eq('chat_id', chat.id)
  .eq('revoked', false)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
check('reuse existing non-revoked invite', existing?.token === invite1?.token);

// 7. joiner joins via the invite token — via the RPC, not a direct table
// read, since a non-member can't pass the invites SELECT policy directly
// (see supabase/fix_invite_lookup.sql).
const { data: inviteRow, error: e7b } = await joiner.client
  .rpc('get_invite_by_token', { p_token: invite1.token })
  .maybeSingle();
check('joiner can resolve invite by token via RPC', !!inviteRow, e7b?.message ?? JSON.stringify(inviteRow));

const { error: e8 } = await joiner.client
  .from('chat_members')
  .insert({ chat_id: inviteRow.chat_id, user_id: joiner.id, role: 'member' });
check('joiner inserts own membership via invite', !e8, e8?.message);

// Re-joining the same invite should hit the (chat_id,user_id) unique violation, not crash
const { error: e9 } = await joiner.client
  .from('chat_members')
  .insert({ chat_id: inviteRow.chat_id, user_id: joiner.id, role: 'member' });
check('re-join is a clean 23505 unique violation', e9?.code === '23505', e9?.code ?? 'no error?!');

// 8. memberA (admin) leaves
const { error: e10 } = await memberA.client
  .from('chat_members')
  .delete()
  .eq('chat_id', chat.id)
  .eq('user_id', memberA.id);
check('admin leaves group (self-delete)', !e10, e10?.message);

console.log(allOk ? '\nAll group checks passed.' : '\nSome checks FAILED — see above.');
process.exit(allOk ? 0 : 1);
