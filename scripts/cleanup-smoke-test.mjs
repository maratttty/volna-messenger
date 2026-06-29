// Removes everything created by scripts/smoke-test.mjs (profiles starting
// with "smoke_", their chats, members, and messages). Uses the service role
// key, which bypasses RLS entirely.
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

async function main() {
  const env = loadEnvLocal();
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, username')
    .or(
      'username.like.smoke_%,username.like.rt_%,username.like.storage_%,username.like.mt_%,username.like.fwd_%,username.like.grp_%',
    );
  if (profErr) throw profErr;

  if (!profiles || profiles.length === 0) {
    console.log('No smoke-test profiles found, nothing to clean up.');
    return;
  }

  const ids = profiles.map((p) => p.id);
  console.log(`Found ${ids.length} smoke-test profiles:`, profiles.map((p) => p.username).join(', '));

  const { data: chats } = await admin.from('chats').select('id').in('created_by', ids);
  const chatIds = (chats ?? []).map((c) => c.id);

  if (chatIds.length > 0) {
    await admin.from('messages').delete().in('chat_id', chatIds);
    await admin.from('chat_members').delete().in('chat_id', chatIds);
    await admin.from('chats').delete().in('id', chatIds);
    console.log(`✓ Removed ${chatIds.length} test chat(s) and their messages/members`);
  }

  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  console.log(`✓ Removed ${ids.length} test auth user(s) (profiles cascade automatically)`);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\n✗ Cleanup failed:', err.message ?? err);
  process.exit(1);
});
