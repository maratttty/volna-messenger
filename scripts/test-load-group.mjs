// Load-checks a 50+ member group against the real schema+RLS: bulk member
// insert, member-list fetch with profile join, RLS visibility for a regular
// member, and a message send — all timed. Self-cleaning: removes every user
// it creates in a `finally`, regardless of pass/fail, so it never leaves
// fixtures behind for the regular cleanup-smoke-test.mjs to find.
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
const MEMBER_COUNT = 50; // + 1 owner = 51, matches the "group 50+" MVP criterion
let allOk = true;

function check(label, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) allOk = false;
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const userIds = [];

try {
  console.log(`Creating ${MEMBER_COUNT + 1} users via admin API...`);
  const t0 = Date.now();
  const users = [];
  for (let i = 0; i <= MEMBER_COUNT; i++) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `load${i}+${stamp}@example.com`,
      password: 'SmokeTest123!',
      email_confirm: true,
    });
    if (error) throw error;
    users.push({ id: data.user.id, email: data.user.email });
    userIds.push(data.user.id);
  }
  const owner = users[0];
  const members = users.slice(1);

  await admin.from('profiles').insert(
    users.map((u, i) => ({ id: u.id, username: `load_${i}_${stamp}`, display_name: `Load Tester ${i}` })),
  );
  console.log(`✓ ${users.length} users + profiles ready in ${Date.now() - t0}ms`);

  // Sign in as the owner with a regular client, same as the real app would.
  const ownerClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { error: signInErr } = await ownerClient.auth.signInWithPassword({
    email: owner.email,
    password: 'SmokeTest123!',
  });
  check('owner signs in', !signInErr, signInErr?.message);

  const { data: chat, error: chatErr } = await ownerClient
    .from('chats')
    .insert({ type: 'group', title: 'Load Test Group', created_by: owner.id })
    .select('id')
    .single();
  check('create group chat', !chatErr && !!chat, chatErr?.message);

  const t1 = Date.now();
  const rows = [
    { chat_id: chat.id, user_id: owner.id, role: 'owner' },
    ...members.map((m) => ({ chat_id: chat.id, user_id: m.id, role: 'member' })),
  ];
  const { error: memberErr } = await ownerClient.from('chat_members').insert(rows);
  const insertMs = Date.now() - t1;
  check(`bulk-insert ${rows.length} members`, !memberErr, memberErr?.message);
  console.log(`  → insert took ${insertMs}ms`);

  const t2 = Date.now();
  const { data: memberList, error: fetchErr } = await ownerClient
    .from('chat_members')
    .select('*, profile:profiles(*)')
    .eq('chat_id', chat.id)
    .order('joined_at', { ascending: true });
  const fetchMs = Date.now() - t2;
  check(
    `fetch member list with profile join (${memberList?.length ?? 0}/${rows.length})`,
    !fetchErr && memberList?.length === rows.length && memberList.every((m) => !!m.profile?.display_name),
    fetchErr?.message,
  );
  console.log(`  → fetch took ${fetchMs}ms`);

  const { error: msgErr } = await ownerClient
    .from('messages')
    .insert({ chat_id: chat.id, sender_id: owner.id, type: 'text', content: 'hello 50', client_id: crypto.randomUUID() });
  check('owner sends a message', !msgErr, msgErr?.message);

  // A random regular member (not the owner) should see the chat via RLS.
  const sampleMember = members[Math.floor(members.length / 2)];
  const memberClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  await memberClient.auth.signInWithPassword({ email: sampleMember.email, password: 'SmokeTest123!' });
  const { data: visibleChat, error: visErr } = await memberClient
    .from('chats')
    .select('id')
    .eq('id', chat.id)
    .maybeSingle();
  check('a regular member (#25) can see the chat via RLS', !visErr && visibleChat?.id === chat.id, visErr?.message);

  const { data: visibleMsgs } = await memberClient.from('messages').select('id').eq('chat_id', chat.id);
  check('that member can read the message', (visibleMsgs?.length ?? 0) >= 1);

  console.log(allOk ? '\nAll load checks passed.' : '\nSome checks FAILED — see above.');
} finally {
  console.log('\nCleaning up...');
  if (userIds.length > 0) {
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    console.log(`✓ Removed ${userIds.length} test users (profiles/chats/members cascade)`);
  }
}

process.exit(allOk ? 0 : 1);
