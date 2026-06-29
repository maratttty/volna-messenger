import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const env = {};
  for (const line of readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const env = loadEnvLocal();
const ref = env.SUPABASE_PROJECT_REF;
const password = env.SUPABASE_DB_PASSWORD;

const regions = [
  'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'sa-east-1',
];
const prefixes = ['aws-0', 'aws-1'];

async function tryRegion(prefix, region) {
  const client = new pg.Client({
    host: `${prefix}-${region}.pooler.supabase.com`,
    port: 6543,
    user: `postgres.${ref}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
    return { ok: true };
  } catch (err) {
    try { await client.end(); } catch {}
    return { ok: false, message: err.message };
  }
}

(async () => {
  for (const prefix of prefixes) {
    for (const region of regions) {
      process.stdout.write(`Trying ${prefix}-${region}... `);
      const result = await tryRegion(prefix, region);
      console.log(result.ok ? 'MATCH ✓' : `no (${result.message})`);
      if (result.ok) {
        console.log(`\nFound it: ${prefix}-${region}.pooler.supabase.com`);
        process.exit(0);
      }
    }
  }
  console.log('\nNo region matched.');
  process.exit(1);
})();
