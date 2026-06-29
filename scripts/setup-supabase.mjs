// One-off setup script: runs the SQL schema against the project's Postgres
// database and creates the Storage buckets. Run with: node scripts/setup-supabase.mjs
// Reads credentials from .env.local (never commit that file).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  if (!existsSync(envPath)) {
    throw new Error('.env.local not found at project root');
  }
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

async function runSql(client, file) {
  const sql = readFileSync(path.join(root, file), 'utf8');
  console.log(`\n→ Running ${file}...`);
  await client.query(sql);
  console.log(`✓ ${file} applied`);
}

async function main() {
  const env = loadEnvLocal();
  const ref = env.SUPABASE_PROJECT_REF;
  const dbPassword = env.SUPABASE_DB_PASSWORD;
  const url = env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!ref || !dbPassword || !url || !serviceRoleKey) {
    throw new Error('Missing one of SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD / VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  // --- 1. Apply SQL schema via direct Postgres connection ---
  // Direct connection (db.<ref>.supabase.co) is IPv6-only and unreachable over
  // many VPNs; use the IPv4-compatible connection pooler instead.
  const client = new pg.Client({
    host: env.SUPABASE_DB_HOST || `aws-0-eu-central-1.pooler.supabase.com`,
    port: Number(env.SUPABASE_DB_PORT) || 6543,
    user: `postgres.${ref}`,
    password: dbPassword,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connecting to Postgres...');
  await client.connect();
  console.log('✓ Connected');

  try {
    await runSql(client, 'supabase/reset.sql');
    await runSql(client, 'supabase/schema.sql');
  } finally {
    await client.end();
  }

  // --- 2. Create Storage buckets via Supabase Admin API ---
  const admin = createClient(url, serviceRoleKey);
  for (const bucket of ['avatars', 'attachments']) {
    console.log(`\n→ Creating bucket "${bucket}"...`);
    const { error } = await admin.storage.createBucket(bucket, { public: true });
    if (error && !error.message?.includes('already exists')) {
      throw error;
    }
    console.log(`✓ Bucket "${bucket}" ready`);
  }

  console.log('\nAll done.');
}

main().catch((err) => {
  console.error('\n✗ Setup failed:', err.message ?? err);
  process.exit(1);
});
