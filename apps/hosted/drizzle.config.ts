import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'sqlite', schema: './apps/hosted/db/schema.ts', out: './apps/hosted/drizzle' });
