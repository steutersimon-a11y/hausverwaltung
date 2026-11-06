import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalDatabase = globalThis as unknown as { atlasSql?: ReturnType<typeof postgres> };
// postgres-js connects lazily. Build-time imports do not contact the database.
export const sqlClient = globalDatabase.atlasSql ?? postgres(
  process.env.DATABASE_URL ?? 'postgres://atlas:atlas_dev_password@127.0.0.1:5432/atlas',
  { max:10, prepare:false, idle_timeout:20, connect_timeout:10 },
);
if (process.env.NODE_ENV !== 'production') globalDatabase.atlasSql = sqlClient;
export const db = drizzle(sqlClient, { schema });
export * from './schema';
export { schema };

export * from './import-schema';
