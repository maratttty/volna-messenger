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

async function main() {
  const client = createClient(url, anonKey);
  const email = `storagetest+${stamp}@example.com`;
  const { data: signUpData, error: signUpErr } = await client.auth.signUp({ email, password: 'SmokeTest123!' });
  if (signUpErr) throw new Error(`signUp: ${signUpErr.message}`);
  if (!signUpData.session) throw new Error('signUp: no session — email confirmation still ON');
  const userId = signUpData.user.id;

  const { error: profErr } = await client
    .from('profiles')
    .insert({ id: userId, username: `storage_${stamp}`, display_name: 'Storage Test' });
  if (profErr) throw new Error(`profile: ${profErr.message}`);

  console.log('→ Uploading a small test file as an authenticated (anon-key) client...');
  const fakeFile = new Blob(['hello attachment'], { type: 'text/plain' });
  const path_ = `${userId}/${crypto.randomUUID()}.txt`;
  const { error: uploadErr } = await client.storage.from('attachments').upload(path_, fakeFile, {
    contentType: 'text/plain',
  });
  if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);
  console.log('✓ Upload succeeded');

  const { data: publicUrlData } = client.storage.from('attachments').getPublicUrl(path_);
  console.log(`→ Fetching public URL: ${publicUrlData.publicUrl}`);
  const res = await fetch(publicUrlData.publicUrl);
  if (!res.ok) throw new Error(`public fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  if (text !== 'hello attachment') throw new Error(`unexpected content: ${text}`);
  console.log('✓ Public URL is readable and content matches');

  console.log('\n✅ Storage upload + public read both work.');
}

main().catch((err) => {
  console.error('\n✗ Storage test failed:', err.message ?? err);
  process.exit(1);
});
