import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: text('data').notNull()
});
