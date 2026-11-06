import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, auditEvents, floors, units } from '@atlas/db';
import { ApiError } from './http';
import { type Actor, requireProperty, requireUnit } from './security';
import { unitDto } from './portfolio';

const fields = {
  label: z.string().trim().min(1).max(160),
  areaM2: z.number().finite().positive().max(1_000_000).multipleOf(0.01).nullable(),
  rooms: z.number().finite().positive().max(100).multipleOf(0.5).nullable(),
  status: z.enum(['occupied', 'vacant', 'owner_occupied', 'unavailable']),
  note: z.string().max(10_000),
};
export const updateUnitSchema = z.object({ revision: z.number().int().positive(), label: fields.label.optional(), areaM2: fields.areaM2.optional(), rooms: fields.rooms.optional(), status: fields.status.optional(), note: fields.note.optional() }).strict()
  .refine(v => Object.keys(v).length > 1, { message: 'Bitte mindestens ein Feld ändern.' });
export const createUnitSchema = z.object({ propertyId: z.uuid(), buildingId: z.uuid(), floorId: z.uuid(), code: z.string().trim().min(1).max(80),
  label: fields.label, usage: z.enum(['residential', 'commercial', 'parking']), status: fields.status, areaM2: fields.areaM2, rooms: fields.rooms, note: fields.note.default('') }).strict();
export const archiveUnitSchema = z.object({ revision: z.number().int().positive() }).strict();

export async function updateUnit(actor: Actor, id: string, input: z.infer<typeof updateUnitSchema>) {
  const { unit } = await requireUnit(actor, id, true);
  const { revision, ...changes } = input;
  return db.transaction(async tx => {
    const [updated] = await tx.update(units).set({ ...changes,
      areaM2: input.areaM2 === undefined ? undefined : input.areaM2 === null ? null : input.areaM2.toFixed(2),
      rooms: input.rooms === undefined ? undefined : input.rooms === null ? null : input.rooms.toFixed(1),
      revision: revision + 1, updatedAt: new Date(),
    }).where(and(eq(units.organizationId, actor.organizationId), eq(units.propertyId, unit.propertyId), eq(units.id, id), eq(units.revision, revision), isNull(units.archivedAt))).returning();
    if (!updated) throw new ApiError('REVISION_CONFLICT', 409, 'Die Einheit wurde inzwischen geändert. Bitte lade die aktuellen Daten neu.');
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: unit.propertyId, actorId: actor.user.id, entityType: 'unit', entityId: id,
      action: 'unit.updated', before: { ...unitDto(unit) }, after: { ...unitDto(updated) } });
    return { unit: unitDto(updated) };
  });
}

export async function createUnit(actor: Actor, input: z.infer<typeof createUnitSchema>) {
  await requireProperty(actor, input.propertyId, true);
  const [floor] = await db.select({ id: floors.id }).from(floors).where(and(eq(floors.organizationId, actor.organizationId), eq(floors.propertyId, input.propertyId), eq(floors.buildingId, input.buildingId), eq(floors.id, input.floorId))).limit(1);
  if (!floor) throw new ApiError('INVALID_HIERARCHY', 422, 'Gebäude und Geschoss passen nicht zum gewählten Objekt.');
  return db.transaction(async tx => {
    const [created] = await tx.insert(units).values({ ...input, organizationId: actor.organizationId, source: 'manual',
      areaM2: input.areaM2 === null ? null : input.areaM2.toFixed(2), rooms: input.rooms === null ? null : input.rooms.toFixed(1),
    }).returning();
    if (!created) throw new Error('Unit insert did not return a row');
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: input.propertyId, actorId: actor.user.id, entityType: 'unit', entityId: created.id,
      action: 'unit.created', before: null, after: { ...unitDto(created) } });
    return { unit: unitDto(created) };
  });
}

export async function archiveUnit(actor: Actor, id: string, revision: number) {
  const { unit } = await requireUnit(actor, id, true);
  return db.transaction(async tx => {
    const [updated] = await tx.update(units).set({ archivedAt: new Date(), updatedAt: new Date(), revision: revision + 1 })
      .where(and(eq(units.organizationId, actor.organizationId), eq(units.propertyId, unit.propertyId), eq(units.id, id), eq(units.revision, revision), isNull(units.archivedAt))).returning();
    if (!updated) throw new ApiError('REVISION_CONFLICT', 409, 'Die Einheit wurde inzwischen geändert. Bitte lade sie neu.');
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: unit.propertyId, actorId: actor.user.id, entityType: 'unit', entityId: id,
      action: 'unit.archived', before: { ...unitDto(unit) }, after: { archivedAt: updated.archivedAt!.toISOString(), revision: updated.revision } });
    return { archived: true, id, revision: updated.revision };
  });
}
