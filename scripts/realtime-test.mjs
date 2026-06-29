// Verifies that postgres_changes realtime actually fires for INSERT on
// messages — this is what was silently broken (RLS was fine, but the table
// wasn't in the supabase_realtime publication, so no events were sent at all).
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

async function signUpAndProfile(client, label) {
  const email = `realtimetest+${label}-${stamp}@example.com`;
  const password = 'SmokeTest123!';
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`signUp(${label}): ${error.message}`);
  if (!data.session) throw new Error(`signUp(${label}): no session — email confirmation is still ON`);
  const userId = data.user.id;
  const username = `rt_${label}_${stamp}`;
  const { error: profErr } = await client.from('profiles').insert({ id: userId, username, display_name: `RT ${label}` });
  if (profErr) throw new Error(`profile(${label}): ${profErr.message}`);
  return userId;
}

async function main() {
  const clientA = createClient(url, anonKey);
  const clientB = createClient(url, anonKey);

  console.log('→ Setting up two users...');
  const userA = await signUpAndProfile(clientA, 'a');
  const userB = await signUpAndProfile(clientB, 'b');

  console.log('→ Creating chat...');
  const { data: chat, error: chatErr } = await clientA
    .from('chats')
    .insert({ type: 'direct', created_by: userA })
    .select('id')
    .single();
  if (chatErr) throw new Error(`create chat: ${chatErr.message}`);

  await clientA.from('chat_members').insert([
    { chat_id: chat.id, user_id: userA, role: 'owner' },
    { chat_id: chat.id, user_id: userB, role: 'member' },
  ]);

  console.log('→ User B subscribes to realtime on this chat (WITH chat_id filter, like the real app)...');
  const received = await new Promise((resolve) => {
    let settled = false;
    const channel = clientB
      .channel(`rt-test:${chat.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` },
        (payload) => {
          console.log('  [event] postgres_changes INSERT received:', payload.new.id);
          if (!settled && payload.new.chat_id === chat.id) {
            settled = true;
            resolve(payload.new);
          }
        },
      )
      .subscribe((status, err) => {
        console.log(`  [status] ${status}`, err ? `(${err.message})` : '');
        if (status === 'SUBSCRIBED') {
          console.log('→ Subscribed. User A sends a message...');
          void clientA
            .from('messages')
            .insert({
              chat_id: chat.id,
              sender_id: userA,
              content: 'realtime ping',
              client_id: crypto.randomUUID(),
            })
            .then(({ error }) => {
              if (error) console.log('  [insert error]', error.message);
              else console.log('  [insert ok]');
            });
        }
      });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        void clientB.removeChannel(channel);
        resolve(null);
      }
    }, 10_000);
  });

  if (!received) {
    throw new Error('No realtime event received within 10s — publication is still not enabled, or RLS is blocking it.');
  }
  console.log(`✓ Realtime event received: "${received.content}"`);
  console.log('\n✅ Realtime works.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Realtime test failed:', err.message ?? err);
  process.exit(1);
});
