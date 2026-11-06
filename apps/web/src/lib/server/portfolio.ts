import 'server-only';
import { and, asc, count, desc, eq, inArray, isNull, lte, or, gte, sql } from 'drizzle-orm';
import { db, auditEvents, buildings, documents, entrances, floors, parties, properties, tasks, unitParties, units, user } from '@atlas/db';
import type { AuditDto, DocumentDto, PropertySummary, TaskDto, UnitDto } from '@atlas/db/contracts';
import { type Actor, propertyScope, requireProperty, requireUnit } from './security';

export function unitDto(row: typeof units.$inferSelect): UnitDto {
  return { id: row.id, propertyId: row.propertyId, buildingId: row.buildingId, floorId: row.floorId, code: row.code, label: row.label, usage: row.usage, status: row.status,
    areaM2: row.areaM2 === null ? null : Number(row.areaM2), rooms: row.rooms === null ? null : Number(row.rooms), note: row.note, revision: row.revision, source: row.source,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export function documentDto(row: typeof documents.$inferSelect): DocumentDto {
  return { id: row.id, propertyId: row.propertyId, unitId: row.unitId, title: row.title, originalName: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes,
    kind: row.kind, version: row.version, createdAt: row.createdAt.toISOString(), downloadUrl: `/api/atlas/documents/${row.id}/content` };
}
export function taskDto(row: typeof tasks.$inferSelect): TaskDto {
  return { id: row.id, propertyId: row.propertyId, unitId: row.unitId, title: row.title, description: row.description, status: row.status, priority: row.priority,
    dueDate: row.dueDate, revision: row.revision, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function auditFor(actor: Actor, propertyId: string, entityId?: string): Promise<AuditDto[]> {
  // A caller cannot use this helper to request an unscoped entity history.
  await requireProperty(actor, propertyId);
  const rows = await db.select({ event: auditEvents, actorName: user.name }).from(auditEvents)
    .innerJoin(user, eq(user.id, auditEvents.actorId))
    .where(and(eq(auditEvents.organizationId, actor.organizationId), eq(auditEvents.propertyId, propertyId), entityId ? eq(auditEvents.entityId, entityId) : undefined))
    .orderBy(desc(auditEvents.createdAt)).limit(100);
  return rows.map(({ event, actorName }) => ({ id: event.id, action: event.action, entityType: event.entityType, entityId: event.entityId, before: event.before, after: event.after, actorName, createdAt: event.createdAt.toISOString() }));
}

async function summarize(actor: Actor, rows: (typeof properties.$inferSelect)[]): Promise<PropertySummary[]> {
  if (!rows.length) return [];
  const ids = rows.map(p => p.id);
  const [buildingRows, unitCounts, taskCounts] = await Promise.all([
    db.select().from(buildings).where(and(eq(buildings.organizationId, actor.organizationId), inArray(buildings.propertyId, ids))).orderBy(asc(buildings.name)),
    db.select({ propertyId: units.propertyId, count: count(), vacant: sql<number>`sum(case when ${units.status}='vacant' then 1 else 0 end)::int` }).from(units)
      .where(and(eq(units.organizationId, actor.organizationId), inArray(units.propertyId, ids), isNull(units.archivedAt))).groupBy(units.propertyId),
    db.select({ propertyId: tasks.propertyId, count: count() }).from(tasks)
      .where(and(eq(tasks.organizationId, actor.organizationId), inArray(tasks.propertyId, ids), sql`${tasks.status} <> 'done'`)).groupBy(tasks.propertyId),
  ]);
  return rows.map(row => {
    const counts = unitCounts.find(c => c.propertyId === row.id);
    return {
      id: row.id, code: row.code, name: row.name, street: row.street, houseNumber: row.houseNumber, postalCode: row.postalCode, city: row.city,
      latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude), geoStatus: row.geoStatus,
      footprint: row.footprint, managementType: row.managementType, source: row.source, note: row.note, revision: row.revision,
      unitCount: Number(counts?.count ?? 0), vacantUnitCount: Number(counts?.vacant ?? 0), openTaskCount: Number(taskCounts.find(c => c.propertyId === row.id)?.count ?? 0),
      buildings: buildingRows.filter(b => b.propertyId === row.id).map(b => ({ id: b.id, name: b.name, heightM: b.heightM === null ? null : Number(b.heightM), footprint: b.footprint })),
    };
  });
}

export async function getPortfolio(actor: Actor, limit = 250, offset = 0) {
  const rows = await db.select().from(properties).where(propertyScope(actor)).orderBy(asc(properties.code)).limit(limit).offset(offset);
  return { properties: await summarize(actor, rows), organization: { id: actor.organizationId, name: actor.organizationName }, membership: { role: actor.role }, user: actor.user };
}

export async function getProperty(actor: Actor, id: string) {
  const row = await requireProperty(actor, id);
  const [summary, allBuildings, allFloors, allEntrances, allUnits, audit] = await Promise.all([
    summarize(actor, [row]),
    db.select().from(buildings).where(and(eq(buildings.organizationId, actor.organizationId), eq(buildings.propertyId, id))).orderBy(asc(buildings.name)),
    db.select().from(floors).where(and(eq(floors.organizationId, actor.organizationId), eq(floors.propertyId, id))).orderBy(asc(floors.level), asc(floors.name)),
    db.select().from(entrances).where(and(eq(entrances.organizationId, actor.organizationId), eq(entrances.propertyId, id))).orderBy(asc(entrances.name)),
    db.select().from(units).where(and(eq(units.organizationId, actor.organizationId), eq(units.propertyId, id), isNull(units.archivedAt))).orderBy(asc(units.code)),
    auditFor(actor, id),
  ]);
  await db.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: id, actorId: actor.user.id, entityType: 'property', entityId: id, action: 'property.viewed', before: null, after: null });
  return { property: summary[0]!, buildings: allBuildings.map(b => ({ id: b.id, name: b.name, heightM: b.heightM === null ? null : Number(b.heightM), footprint: b.footprint,
    entrances: allEntrances.filter(e => e.buildingId === b.id).map(e => ({ id: e.id, name: e.name })),
    floors: allFloors.filter(f => f.buildingId === b.id).map(f => ({ id: f.id, name: f.name, level: f.level, entranceId: f.entranceId, units: allUnits.filter(u => u.floorId === f.id).map(unitDto) })),
  })), audit };
}

function berlinDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year','month','day'].map(t => parts.find(p => p.type === t)!.value).join('-');
}

export async function getUnit(actor: Actor, id: string) {
  const { unit, property } = await requireUnit(actor, id);
  const today = berlinDate();
  const [summary, relatedParties, relatedDocuments, relatedTasks, audit] = await Promise.all([
    summarize(actor, [property]),
    db.select({ id: parties.id, name: parties.name, role: unitParties.role, source: parties.source }).from(unitParties)
      .innerJoin(parties, and(eq(parties.id, unitParties.partyId), eq(parties.organizationId, actor.organizationId)))
      .where(and(eq(unitParties.organizationId, actor.organizationId), eq(unitParties.propertyId, property.id), eq(unitParties.unitId, id), lte(unitParties.validFrom, today), or(isNull(unitParties.validTo), gte(unitParties.validTo, today)))),
    db.select().from(documents).where(and(eq(documents.organizationId, actor.organizationId), eq(documents.propertyId, property.id), eq(documents.unitId, id))).orderBy(desc(documents.createdAt)),
    db.select().from(tasks).where(and(eq(tasks.organizationId, actor.organizationId), eq(tasks.propertyId, property.id), eq(tasks.unitId, id))).orderBy(desc(tasks.createdAt)),
    auditFor(actor, property.id, id),
  ]);
  await db.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: property.id, actorId: actor.user.id, entityType: 'unit', entityId: id, action: 'unit.viewed', before: null, after: null });
  return { unit: unitDto(unit), property: summary[0]!, parties: relatedParties, documents: relatedDocuments.map(documentDto), tasks: relatedTasks.map(taskDto), audit };
}
