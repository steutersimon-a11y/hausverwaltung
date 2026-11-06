import { boolean, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations, properties, user } from './schema';

export const importBatches = pgTable('import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdBy: text('created_by').notNull().references(() => user.id),
  sourceSystem: text('source_system').notNull(),
  dataClass: text('data_class').$type<'synthetic' | 'real'>().notNull(),
  format: text('format').$type<'csv' | 'json' | 'screenshot'>().notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  sha256: text('sha256').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: text('status').$type<'review' | 'imported'>().notNull().default('review'),
  revision: integer('revision').notNull().default(1),
  importedAt: timestamp('imported_at', { withTimezone: true }),
  importedBy: text('imported_by').references(() => user.id),
  report: jsonb('report').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('import_batches_scope_uidx').on(table.organizationId, table.id),
  index('import_batches_org_idx').on(table.organizationId, table.createdAt),
]);

export const importRecords = pgTable('import_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  batchId: uuid('batch_id').notNull().references(() => importBatches.id),
  sourceLine: integer('source_line').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  rawData: jsonb('raw_data').$type<Record<string, unknown>>().notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  sourceIssues: jsonb('source_issues').$type<Record<string, unknown>[]>().notNull().default([]),
  included: boolean('included').notNull().default(true),
  confirmed: boolean('confirmed').notNull().default(false),
  propertyId: uuid('property_id').references(() => properties.id),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('import_records_line_uidx').on(table.batchId, table.sourceLine),
  index('import_records_batch_idx').on(table.organizationId, table.batchId),
  foreignKey({ columns: [table.organizationId, table.batchId], foreignColumns: [importBatches.organizationId, importBatches.id] }),
  foreignKey({ columns: [table.organizationId, table.propertyId], foreignColumns: [properties.organizationId, properties.id] }),
]);
