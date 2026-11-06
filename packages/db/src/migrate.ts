import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

try { process.loadEnvFile?.(); } catch { /* CI passes environment directly. */ }
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL fehlt. Bitte zuerst die lokale .env konfigurieren.');
const client = postgres(url, { max:1, prepare:false });
const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
try {
  await client.begin(async tx => {
    await tx`select pg_advisory_xact_lock(581771092)`;
    await tx`create table if not exists atlas_migrations (name text primary key, applied_at timestamptz not null default now())`;
    for (const file of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const [existing] = await tx`select name from atlas_migrations where name=${file}`;
      if (existing) continue;
      await tx.unsafe(await readFile(`${directory}/${file}`, 'utf8'));
      await tx`insert into atlas_migrations (name) values (${file})`;
      console.info(`Migration angewendet: ${file}`);
    }
  });
} finally {
  await client.end();
}
