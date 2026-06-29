// End-to-end sanity check: sign up two users, create profiles, start a direct
// chat, send a message. Mirrors what the UI does, run headlessly via the API.
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
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const stamp = Date.now();

async function signUpAndProfile(label) {
  const client = createClient(url, anonKey);
  const email = `smoketest+${label}-${stamp}@example.com`;
  const password = 'SmokeTest123!';

  const { data: signUpData, error: signUpErr } = await client.auth.signUp({ email, password });
  if (signUpErr) throw new Error(`signUp(${label}): ${signUpErr.message}`);
  if (!signUpData.session) throw new Error(`signUp(${label}): no session — email confirmation is still ON`);

  const userId = signUpData.user.id;
  const username = `smoke_${label}_${stamp}`;
  const { error: profileErr } = await client
    .from('profiles')
    .insert({ id: userId, username, display_name: `Smoke ${label}` });
  if (profileErr) throw new Error(`profile(${label}): ${profileErr.message}`);

  console.log(`✓ ${label}: signed up + profile created (${username})`);
  return { client, userId, username };
}

async function main() {
  console.log('→ Creating user A...');
  const a = await signUpAndProfile('a');
  console.log('→ Creating user B...');
  const b = await signUpAndProfile('b');

  console.log('\n→ User A creates a direct chat with B...');
  const { data: chat, error: chatErr } = await a.client
    .from('chats')
    .insert({ type: 'direct', created_by: a.userId })
    .select('id')
    .single();
  if (chatErr) throw new Error(`create chat: ${chatErr.message}`);

  const { error: memErr } = await a.client.from('chat_members').insert([
    { chat_id: chat.id, user_id: a.userId, role: 'owner' },
    { chat_id: chat.id, user_id: b.userId, role: 'member' },
  ]);
  if (memErr) throw new Error(`add members: ${memErr.message}`);
  console.log(`✓ Chat created: ${chat.id}`);

  console.log('\n→ User A sends a message...');
  const clientId = crypto.randomUUID();
  const { error: msgErr } = await a.client
    .from('messages')
    .insert({ chat_id: chat.id, sender_id: a.userId, content: 'Привет от smoke-теста', client_id: clientId });
  if (msgErr) throw new Error(`send message: ${msgErr.message}`);
  console.log('✓ Message sent');

  console.log('\n→ User B reads the chat (RLS check)...');
  const { data: messages, error: readErr } = await b.client
    .from('messages')
    .select('content')
    .eq('chat_id', chat.id);
  if (readErr) throw new Error(`read as B: ${readErr.message}`);
  if (!messages || messages.length !== 1) throw new Error(`expected 1 message visible to B, got ${messages?.length}`);
  console.log(`✓ User B can read the message: "${messages[0].content}"`);

  console.log('\n→ Fetching message id for status check...');
  const { data: sentMsg } = await a.client.from('messages').select('id').eq('chat_id', chat.id).single();

  console.log('→ User B marks the message as read...');
  const { error: statusErr } = await b.client
    .from('message_status')
    .upsert({ message_id: sentMsg.id, user_id: b.userId, status: 'read' }, { onConflict: 'message_id,user_id' });
  if (statusErr) throw new Error(`mark read: ${statusErr.message}`);

  console.log('→ User A checks the read receipt...');
  const { data: statusRows, error: statusReadErr } = await a.client
    .from('message_status')
    .select('status')
    .eq('message_id', sentMsg.id)
    .eq('user_id', b.userId);
  if (statusReadErr) throw new Error(`read status as A: ${statusReadErr.message}`);
  if (statusRows?.[0]?.status !== 'read') throw new Error(`expected status "read", got ${JSON.stringify(statusRows)}`);
  console.log('✓ User A can see the read receipt from B');

  console.log('\n✅ All smoke checks passed.');
}

main().catch((err) => {
  console.error('\n✗ Smoke test failed:', err.message);
  process.exit(1);
});
