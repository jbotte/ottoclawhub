// Applies migrations/*.sql to DATABASE_URL (Neon). Usage: DATABASE_URL=... npm run migrate
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
try {
  const env = await readFile(join(root, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env */ }

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Get your connection string from the Neon console and put it in .env');
  process.exit(1);
}
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const dir = join(root, 'migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  console.log(`applying ${f} ...`);
  await sql.query(await readFile(join(dir, f), 'utf8'));
}
console.log('migrations complete.');
