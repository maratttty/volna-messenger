// Creates the Storage buckets used by the app (avatars, attachments).
// Run with: node scripts/setup-storage.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  if (!existsSync(envPath)) throw new Error('.env.local not found at project root');
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const admin = createClient(url, serviceRoleKey);

  for (const bucket of ['avatars', 'attachments']) {
    console.log(`\n→ Creating bucket "${bucket}"...`);
    const { error } = await admin.storage.createBucket(bucket, { public: true });
    if (error) {
      if (error.message?.toLowerCase().includes('already exists')) {
        console.log(`✓ Bucket "${bucket}" already exists`);
        continue;
      }
      throw error;
    }
    console.log(`✓ Bucket "${bucket}" created`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message ?? err);
  process.exit(1);
});
