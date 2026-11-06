import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, auditEvents, documentVersions, documents, properties } from '@atlas/db';
import { ApiError } from './http';
import { type Actor, propertyScope, requireProperty, requireUnit } from './security';
import { documentDto } from './portfolio';
import { deletePrivateFile, getPrivateFile, inspectUpload, putPrivateFile } from './storage';

export const documentQuerySchema = z.object({ propertyId: z.uuid().optional(), unitId: z.uuid().optional() }).strict();
export const documentFieldsSchema = z.object({ propertyId: z.uuid(), unitId: z.uuid().optional(), kind: z.enum(['floorplan', 'document']).default('document'), title: z.string().trim().min(1).max(180).optional() }).strict();

export async function listDocuments(actor: Actor, query: z.infer<typeof documentQuerySchema>) {
  if (query.propertyId) await requireProperty(actor, query.propertyId);
  if (query.unitId) {
    const { unit } = await requireUnit(actor, query.unitId);
    if (query.propertyId && unit.propertyId !== query.propertyId) throw new ApiError('NOT_FOUND', 404, 'Einheit nicht gefunden.');
  }
  const rows = await db.select({ document: documents }).from(documents)
    .innerJoin(properties, and(eq(properties.id, documents.propertyId), eq(properties.organizationId, documents.organizationId)))
    .where(and(propertyScope(actor), eq(documents.organizationId, actor.organizationId), query.propertyId ? eq(documents.propertyId, query.propertyId) : undefined, query.unitId ? eq(documents.unitId, query.unitId) : undefined))
    .orderBy(desc(documents.createdAt)).limit(250);
  return { documents: rows.map(row => documentDto(row.document)) };
}

export async function createDocument(actor: Actor, file: File, fields: z.infer<typeof documentFieldsSchema>) {
  await requireProperty(actor, fields.propertyId, true);
  if (fields.unitId) {
    const { unit } = await requireUnit(actor, fields.unitId, true);
    if (unit.propertyId !== fields.propertyId) throw new ApiError('INVALID_HIERARCHY', 422, 'Die Einheit gehört nicht zum gewählten Objekt.');
  }
  const [existing] = await db.select({ count: count() }).from(documents).where(and(eq(documents.organizationId, actor.organizationId), eq(documents.propertyId, fields.propertyId)));
  if (Number(existing?.count) >= 1000) throw new ApiError('DOCUMENT_LIMIT', 409, 'Für dieses Objekt ist die Dokumentgrenze des Prototyps erreicht.');
  const inspected = await inspectUpload(file);
  const stored = await putPrivateFile(inspected.bytes, inspected.mimeType, actor.organizationId);
  try {
    return await db.transaction(async tx => {
      const id = randomUUID();
      const [created] = await tx.insert(documents).values({ id, organizationId: actor.organizationId, propertyId: fields.propertyId, unitId: fields.unitId ?? null,
        title: fields.title ?? inspected.originalName, originalName: inspected.originalName, mimeType: inspected.mimeType, sizeBytes: inspected.bytes.byteLength,
        kind: fields.kind, version: 1, source: 'manual', createdBy: actor.user.id,
      }).returning();
      if (!created) throw new Error('Document insert did not return a row');
      await tx.insert(documentVersions).values({ organizationId: actor.organizationId, propertyId: fields.propertyId, documentId: id, version: 1,
        storageKey: stored.key, sha256: stored.sha256, mimeType: inspected.mimeType, sizeBytes: inspected.bytes.byteLength, originalName: inspected.originalName, createdBy: actor.user.id });
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: fields.propertyId, actorId: actor.user.id, entityType: 'document', entityId: id,
        action: 'document.uploaded', before: null, after: { unitId: fields.unitId ?? null, title: created.title, version: 1, mimeType: inspected.mimeType, sha256: stored.sha256, sizeBytes: inspected.bytes.byteLength } });
      return { document: documentDto(created) };
    });
  } catch (error) { await deletePrivateFile(stored.key); throw error; }
}

export async function addDocumentVersion(actor: Actor, id: string, expectedVersion: number, file: File) {
  const [document] = await db.select().from(documents).where(and(eq(documents.organizationId, actor.organizationId), eq(documents.id, id))).limit(1);
  if (!document) throw new ApiError('NOT_FOUND', 404, 'Dokument nicht gefunden.');
  await requireProperty(actor, document.propertyId, true);
  if (document.unitId) await requireUnit(actor, document.unitId, true);
  const inspected = await inspectUpload(file);
  const stored = await putPrivateFile(inspected.bytes, inspected.mimeType, actor.organizationId);
  try {
    return await db.transaction(async tx => {
      const [updated] = await tx.update(documents).set({ version: expectedVersion + 1, originalName: inspected.originalName, mimeType: inspected.mimeType, sizeBytes: inspected.bytes.byteLength, updatedAt: new Date() })
        .where(and(eq(documents.organizationId, actor.organizationId), eq(documents.propertyId, document.propertyId), eq(documents.id, id), eq(documents.version, expectedVersion))).returning();
      if (!updated) throw new ApiError('REVISION_CONFLICT', 409, 'Das Dokument hat bereits eine neuere Version. Bitte lade es neu.');
      await tx.insert(documentVersions).values({ organizationId: actor.organizationId, propertyId: document.propertyId, documentId: id, version: updated.version,
        storageKey: stored.key, sha256: stored.sha256, mimeType: inspected.mimeType, sizeBytes: inspected.bytes.byteLength, originalName: inspected.originalName, createdBy: actor.user.id });
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: document.propertyId, actorId: actor.user.id, entityType: 'document', entityId: id,
        action: 'document.version_added', before: { version: document.version }, after: { version: updated.version, sha256: stored.sha256, mimeType: inspected.mimeType, sizeBytes: inspected.bytes.byteLength } });
      return { document: documentDto(updated) };
    });
  } catch (error) { await deletePrivateFile(stored.key); throw error; }
}

export async function downloadDocument(actor: Actor, id: string, version?: number) {
  const [document] = await db.select().from(documents).where(and(eq(documents.organizationId, actor.organizationId), eq(documents.id, id))).limit(1);
  if (!document) throw new ApiError('NOT_FOUND', 404, 'Dokument nicht gefunden.');
  await requireProperty(actor, document.propertyId);
  const [stored] = await db.select().from(documentVersions).where(and(eq(documentVersions.organizationId, actor.organizationId), eq(documentVersions.propertyId, document.propertyId), eq(documentVersions.documentId, id), eq(documentVersions.version, version ?? document.version))).limit(1);
  if (!stored) throw new ApiError('NOT_FOUND', 404, 'Dokumentversion nicht gefunden.');
  const bytes = await getPrivateFile(stored.storageKey);
  await db.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: document.propertyId, actorId: actor.user.id, entityType: 'document', entityId: id,
    action: 'document.viewed', before: null, after: { version: stored.version } });
  return { bytes, document, version: stored };
}
