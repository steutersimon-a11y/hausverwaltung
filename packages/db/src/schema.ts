import { sql } from 'drizzle-orm';
import {
  bigint, boolean, date, index, integer, jsonb, numeric, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export type Source = 'demo' | 'manual' | 'import';
export type Role = 'admin' | 'manager' | 'editor' | 'viewer';
export type GeoStatus = 'demo' | 'verified' | 'unverified' | 'missing';
export type ManagementType = 'rental' | 'weg' | 'mixed';
export type UnitStatus = 'occupied' | 'vacant' | 'owner_occupied' | 'unavailable';
export type UnitUsage = 'residential' | 'commercial' | 'parking';
export type Footprint = { type: 'Polygon'; coordinates: number[][][] };
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Better Auth owns password hashing, tokens, sessions, and MFA secrets.
export const user = pgTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(), image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false), ...timestamps(),
});
export const session = pgTable('auth_session', {
  id: text('id').primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(), ipAddress: text('ip_address'), userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), ...timestamps(),
}, t => [index('auth_session_user_idx').on(t.userId)]);
export const account = pgTable('auth_account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'), ...timestamps(),
}, t => [index('auth_account_user_idx').on(t.userId), uniqueIndex('auth_account_provider_uidx').on(t.providerId, t.accountId)]);
export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), ...timestamps(),
}, t => [index('auth_verification_identifier_idx').on(t.identifier)]);
export const twoFactor = pgTable('auth_two_factor', {
  id: text('id').primaryKey(), secret: text('secret').notNull(), backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  verified: boolean('verified').default(true), failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone:true }),
}, t => [index('auth_two_factor_user_idx').on(t.userId),index('auth_two_factor_secret_idx').on(t.secret)]);

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(), name: text('name').notNull(),
  source: text('source').$type<Source>().notNull().default('manual'), ...timestamps(),
});
export const memberships = pgTable('memberships', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => user.id), role: text('role').$type<Role>().notNull(),
  ...timestamps(),
}, t => [primaryKey({ columns: [t.organizationId, t.userId] }), index('membership_user_idx').on(t.userId)]);
export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  code: text('code').notNull(), name: text('name').notNull(), street: text('street'), houseNumber: text('house_number'),
  postalCode: text('postal_code'), city: text('city'), latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }), geoStatus: text('geo_status').$type<GeoStatus>().notNull().default('missing'),
  footprint: jsonb('footprint').$type<Footprint>(), managementType: text('management_type').$type<ManagementType>().notNull().default('rental'),
  source: text('source').$type<Source>().notNull().default('manual'), sourceSystem: text('source_system'), sourceRecordId: text('source_record_id'),
  note: text('note').notNull().default(''), revision: integer('revision').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true }), ...timestamps(),
}, t => [uniqueIndex('properties_code_uidx').on(t.organizationId,t.code), uniqueIndex('properties_org_id_uidx').on(t.organizationId,t.id),
  uniqueIndex('properties_source_uidx').on(t.organizationId,t.sourceSystem,t.sourceRecordId), index('properties_org_idx').on(t.organizationId)]);
export const propertyGrants = pgTable('property_grants', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  userId: text('user_id').notNull().references(() => user.id), canEdit: boolean('can_edit').notNull().default(true), ...timestamps(),
}, t => [primaryKey({ columns: [t.organizationId, t.propertyId, t.userId] }), index('property_grant_user_idx').on(t.userId)]);
export const buildings = pgTable('buildings', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), name: text('name').notNull(),
  heightM: numeric('height_m', { precision: 9, scale: 3 }), footprint: jsonb('footprint').$type<Footprint>(),
  modelAssetKey: text('model_asset_key'), source: text('source').$type<Source>().notNull().default('manual'), ...timestamps(),
}, t => [index('buildings_property_idx').on(t.organizationId,t.propertyId), uniqueIndex('buildings_scope_uidx').on(t.organizationId,t.propertyId,t.id)]);
export const entrances = pgTable('entrances', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), buildingId: uuid('building_id').notNull().references(() => buildings.id),
  name: text('name').notNull(), ...timestamps(),
}, t => [uniqueIndex('entrances_scope_uidx').on(t.organizationId,t.propertyId,t.buildingId,t.id)]);
export const floors = pgTable('floors', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), buildingId: uuid('building_id').notNull().references(() => buildings.id),
  entranceId: uuid('entrance_id').references(() => entrances.id), name: text('name').notNull(), level: integer('level').notNull(),
  ...timestamps(),
}, t => [index('floors_building_idx').on(t.organizationId,t.buildingId), uniqueIndex('floors_scope_uidx').on(t.organizationId,t.propertyId,t.buildingId,t.id)]);
export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), buildingId: uuid('building_id').notNull().references(() => buildings.id),
  floorId: uuid('floor_id').notNull().references(() => floors.id), code: text('code').notNull(), label: text('label').notNull(),
  usage: text('usage').$type<UnitUsage>().notNull().default('residential'), status: text('status').$type<UnitStatus>().notNull().default('vacant'),
  areaM2: numeric('area_m2', { precision: 12, scale: 2 }), rooms: numeric('rooms', { precision: 5, scale: 1 }),
  note: text('note').notNull().default(''), revision: integer('revision').notNull().default(1),
  source: text('source').$type<Source>().notNull().default('manual'), archivedAt: timestamp('archived_at', { withTimezone: true }), ...timestamps(),
}, t => [uniqueIndex('units_code_uidx').on(t.organizationId,t.propertyId,t.code), uniqueIndex('units_scope_uidx').on(t.organizationId,t.propertyId,t.id),
  index('units_floor_idx').on(t.organizationId,t.floorId), index('units_property_idx').on(t.organizationId,t.propertyId)]);
export const parties = pgTable('parties', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(), kind: text('kind').$type<'person'|'organization'>().notNull().default('person'),
  source: text('source').$type<Source>().notNull().default('manual'), ...timestamps(),
}, t => [uniqueIndex('parties_scope_uidx').on(t.organizationId,t.id)]);
export const unitParties = pgTable('unit_parties', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), unitId: uuid('unit_id').notNull().references(() => units.id),
  partyId: uuid('party_id').notNull().references(() => parties.id), role: text('role').$type<'tenant'|'co_tenant'|'owner'|'representative'>().notNull(),
  validFrom: date('valid_from', { mode:'string' }).notNull(), validTo: date('valid_to', { mode:'string' }), ...timestamps(),
}, t => [index('unit_parties_unit_idx').on(t.organizationId,t.unitId)]);
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), unitId: uuid('unit_id').references(() => units.id),
  title: text('title').notNull(), originalName: text('original_name').notNull(), mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(), kind: text('kind').$type<'floorplan'|'document'>().notNull().default('document'),
  version: integer('version').notNull().default(1), source: text('source').$type<Source>().notNull().default('manual'),
  createdBy: text('created_by').notNull().references(() => user.id), ...timestamps(),
}, t => [uniqueIndex('documents_scope_uidx').on(t.organizationId,t.propertyId,t.id), index('documents_property_idx').on(t.organizationId,t.propertyId),
  index('documents_unit_idx').on(t.organizationId,t.unitId)]);
export const documentVersions = pgTable('document_versions', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), documentId: uuid('document_id').notNull().references(() => documents.id),
  version: integer('version').notNull(), storageKey: text('storage_key').notNull().unique(), sha256: text('sha256').notNull(),
  mimeType: text('mime_type').notNull(), sizeBytes: integer('size_bytes').notNull(), originalName: text('original_name').notNull(),
  createdBy: text('created_by').notNull().references(() => user.id), createdAt: timestamp('created_at', { withTimezone:true }).notNull().defaultNow(),
}, t => [uniqueIndex('document_versions_number_uidx').on(t.documentId,t.version)]);
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').notNull().references(() => properties.id), unitId: uuid('unit_id').references(() => units.id),
  title: text('title').notNull(), description: text('description').notNull().default(''),
  status: text('status').$type<'open'|'in_progress'|'done'>().notNull().default('open'),
  priority: text('priority').$type<'low'|'normal'|'high'>().notNull().default('normal'), dueDate: date('due_date', { mode:'string' }),
  assignedTo: text('assigned_to').references(() => user.id), createdBy: text('created_by').notNull().references(() => user.id),
  revision: integer('revision').notNull().default(1), ...timestamps(),
}, t => [index('tasks_property_idx').on(t.organizationId,t.propertyId), index('tasks_due_idx').on(t.organizationId,t.status,t.dueDate)]);
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  propertyId: uuid('property_id').references(() => properties.id), actorId: text('actor_id').notNull().references(() => user.id),
  action: text('action').notNull(), entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(),
  before: jsonb('before').$type<Record<string,unknown>|null>(), after: jsonb('after').$type<Record<string,unknown>|null>(),
  createdAt: timestamp('created_at', { withTimezone:true }).notNull().defaultNow(),
}, t => [index('audit_entity_idx').on(t.organizationId,t.entityType,t.entityId,t.createdAt), index('audit_property_idx').on(t.organizationId,t.propertyId)]);
export const bootstrapMeta = pgTable('bootstrap_meta', {
  key: text('key').primaryKey(), value: jsonb('value').$type<Record<string,unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone:true }).notNull().defaultNow(),
});
export const requestRateLimits = pgTable('request_rate_limits', {
  key: text('key').notNull(), windowStart: bigint('window_start', { mode:'number' }).notNull(),
  count: integer('count').notNull().default(0),
}, t => [primaryKey({ columns: [t.key,t.windowStart] })]);

export const databaseNow = sql`now()`;
