import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, auditEvents, importBatches, importRecords, properties } from '@atlas/db';
import { emptyImportProperty, importPropertySchema, ImportParseError, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parsePropertyImport, propertyAddressFingerprint, validateImportProperty } from '@atlas/integrations';
import type { ImportBatchDto, ImportIssue, ImportProperty, ImportRecordDto, ImportReviewDto, ParsedImportRow } from '@atlas/integrations';
import { z } from 'zod';
import { ApiError, idSchema, readLimitedBytes, readMultipart } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import type { Actor } from '@/lib/server/security';
import { deletePrivateFile, inspectUpload, putPrivateFile, safeFilename } from '@/lib/server/storage';

type BatchRow = typeof importBatches.$inferSelect;
type RecordRow = typeof importRecords.$inferSelect;
type PropertyRow = typeof properties.$inferSelect;

export async function importActor(request: Request, write = false): Promise<Actor> {
  if (write) assertMutationOrigin(request);
  const actor = await requireActor(request);
  if (!['admin', 'manager'].includes(actor.role)) throw new ApiError('IMPORT_FORBIDDEN', 403, 'Datenimporte stehen nur Administration und Verwaltung zur Verfügung.');
  if (write) await enforceWriteRateLimit(actor);
  return actor;
}

export async function loadBatch(actor: Actor, id: string): Promise<BatchRow> {
  if (!idSchema.safeParse(id).success) throw new ApiError('NOT_FOUND', 404, 'Import nicht gefunden.');
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.organizationId, actor.organizationId), eq(importBatches.id, id))).limit(1);
  if (!batch) throw new ApiError('NOT_FOUND', 404, 'Import nicht gefunden.');
  return batch;
}

function batchDto(batch: BatchRow, recordCount: number): ImportBatchDto {
  return { id: batch.id, sourceSystem: batch.sourceSystem, dataClass: batch.dataClass, format: batch.format, originalName: batch.originalName,
    status: batch.status, revision: batch.revision, createdAt: batch.createdAt.toISOString(), importedAt: batch.importedAt?.toISOString() ?? null,
    recordCount, sourceUrl: `/api/atlas/imports/${batch.id}/source`, report: batch.report };
}

export function desiredProperty(data: ImportProperty, sourceSystem: string, dataClass: 'synthetic' | 'real') {
  const generatedCode = `IMP-${createHash('sha256').update(`${sourceSystem}\0${data.sourceRecordId}`).digest('hex').slice(0, 12).toUpperCase()}`;
  const code = data.code ?? generatedCode;
  return { code, name: data.name ?? `Objekt ${code}`, street: data.street, houseNumber: data.houseNumber, postalCode: data.postalCode, city: data.city,
    // The fallback is only used to render an invalid preview. Validation blocks
    // committing a row until the reviewer explicitly chooses the mandate type.
    managementType: data.managementType ?? 'rental', note: data.note, source: dataClass === 'synthetic' ? 'demo' as const : 'import' as const,
    sourceSystem, sourceRecordId: data.sourceRecordId };
}

function renderReview(batch: BatchRow, rows: RecordRow[], existing: PropertyRow[]): ImportReviewDto {
  const identity = new Map(existing.filter(property => property.sourceSystem === batch.sourceSystem && property.sourceRecordId).map(property => [property.sourceRecordId!, property]));
  const codes = new Map(existing.map(property => [property.code.toLocaleLowerCase('de-DE'), property]));
  const addresses = new Map<string, PropertyRow>();
  for (const property of existing) {
    const fingerprint = propertyAddressFingerprint(property);
    if (fingerprint) addresses.set(fingerprint, property);
  }
  const seenIds = new Map<string, number>(), seenCodes = new Map<string, number>(), seenAddresses = new Map<string, number>();
  for (const row of rows.filter(row => row.included)) {
    const data = row.data as ImportProperty;
    seenIds.set(data.sourceRecordId, (seenIds.get(data.sourceRecordId) ?? 0) + 1);
    const code = data.code?.toLocaleLowerCase('de-DE');
    if (code) seenCodes.set(code, (seenCodes.get(code) ?? 0) + 1);
    const address = propertyAddressFingerprint(data);
    if (address) seenAddresses.set(address, (seenAddresses.get(address) ?? 0) + 1);
  }
  const records: ImportRecordDto[] = rows.map(row => {
    const data = row.data as ImportProperty;
    const issues = validateImportProperty(data);
    if (row.revision === 1) {
      for (const issue of row.sourceIssues) {
        if (typeof issue.field === 'string' && typeof issue.code === 'string' && typeof issue.message === 'string' && (issue.severity === 'error' || issue.severity === 'warning')) issues.push(issue as ImportIssue);
      }
    }
    if (row.included && (seenIds.get(data.sourceRecordId) ?? 0) > 1) issues.push({ field: 'sourceRecordId', code: 'duplicate_source_id', message: 'Quell-ID mehrfach in den ausgewählten Zeilen. Dublette auslassen oder korrigieren.', severity: 'error' });
    if (row.included && data.code && (seenCodes.get(data.code.toLocaleLowerCase('de-DE')) ?? 0) > 1) issues.push({ field: 'code', code: 'duplicate_code', message: 'Objektcode mehrfach in den ausgewählten Zeilen.', severity: 'error' });
    const fingerprint = propertyAddressFingerprint(data);
    if (row.included && fingerprint && (seenAddresses.get(fingerprint) ?? 0) > 1) issues.push({ field: 'address', code: 'duplicate_address', message: 'Adresse mehrfach im Import. Die getrennte Identität muss vor der Übernahme geklärt werden.', severity: 'error' });
    const match = identity.get(data.sourceRecordId);
    const desired = desiredProperty(data, batch.sourceSystem, batch.dataClass);
    const fields = match ? Object.entries(desired).filter(([key, value]) => (match[key as keyof PropertyRow] ?? null) !== value).map(([field, value]) => ({ field, before: match[field as keyof PropertyRow] ?? null, after: value })) : [];
    let kind: ImportRecordDto['change']['kind'] = 'new';
    let existingPropertyId = match?.id ?? null;
    if (!row.included) kind = 'excluded';
    else if (issues.some(issue => issue.severity === 'error')) kind = 'invalid';
    else if (match) kind = fields.length || match.archivedAt ? 'conflict' : 'unchanged';
    else {
      const collision = codes.get(desired.code.toLocaleLowerCase('de-DE')) ?? (fingerprint ? addresses.get(fingerprint) : undefined);
      if (collision) { kind = 'conflict'; existingPropertyId = collision.id; }
    }
    if (kind === 'conflict') issues.push({ field: 'record', code: 'existing_conflict', message: 'Konflikt mit dem Bestand. Es wird nichts überschrieben. Zeile auslassen oder an den vorhandenen Datensatz angleichen.', severity: 'error' });
    return { id: row.id, sourceLine: row.sourceLine, revision: row.revision, included: row.included, confirmed: row.confirmed, data, issues,
      change: { kind, existingPropertyId, fields } };
  });
  const summary = { total: records.length, new: 0, unchanged: 0, conflict: 0, invalid: 0, excluded: 0, warning: 0, unconfirmed: 0 };
  for (const record of records) {
    summary[record.change.kind]++;
    if (record.included && !record.confirmed) summary.unconfirmed++;
    if (record.included && record.issues.some(issue => issue.severity === 'warning')) summary.warning++;
  }
  return { batch: batchDto(batch, records.length), records, summary };
}

export async function getImportReview(actor: Actor, id: string): Promise<ImportReviewDto> {
  const batch = await loadBatch(actor, id);
  const [rows, existing] = await Promise.all([
    db.select().from(importRecords).where(and(eq(importRecords.organizationId, actor.organizationId), eq(importRecords.batchId, batch.id))).orderBy(importRecords.sourceLine),
    db.select().from(properties).where(eq(properties.organizationId, actor.organizationId)),
  ]);
  return renderReview(batch, rows, existing);
}

export async function listImports(actor: Actor): Promise<{ batches: ImportBatchDto[] }> {
  const rows = await db.select({ batch: importBatches, count: sql<number>`count(${importRecords.id})::integer` }).from(importBatches)
    .leftJoin(importRecords, and(eq(importRecords.organizationId, actor.organizationId), eq(importRecords.batchId, importBatches.id)))
    .where(eq(importBatches.organizationId, actor.organizationId)).groupBy(importBatches.id).orderBy(desc(importBatches.createdAt)).limit(100);
  return { batches: rows.map(row => batchDto(row.batch, Number(row.count))) };
}

export async function createImport(request: Request, actor: Actor): Promise<ImportReviewDto> {
  const form = await readMultipart(request, MAX_IMPORT_BYTES + 32 * 1024);
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_IMPORT_BYTES) throw new ApiError('FILE_SIZE', 413, 'Bitte eine Datei mit höchstens 5 MB auswählen.');
  const sourceSystem = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/).parse(form.get('sourceSystem') ?? 'manual-upload');
  const dataClass = z.enum(['synthetic', 'real']).parse(form.get('dataClass') ?? 'synthetic');
  const originalName = safeFilename(file.name);
  const extension = originalName.split('.').at(-1)?.toLowerCase();
  let bytes: Uint8Array, mimeType: string, format: 'csv' | 'json' | 'screenshot';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '')) {
    const inspected = await inspectUpload(file);
    bytes = inspected.bytes; mimeType = inspected.mimeType; format = 'screenshot';
  } else if (extension === 'csv' || extension === 'json') {
    bytes = new Uint8Array(await file.arrayBuffer());
    format = extension; mimeType = extension === 'csv' ? 'text/csv' : 'application/json';
  } else throw new ApiError('FILE_TYPE', 415, 'Erlaubt sind CSV, JSON und Screenshots als PNG, JPEG oder WebP.');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  let parsed: ParsedImportRow[];
  try {
    parsed = format === 'screenshot' ? [{ sourceLine: 1, data: emptyImportProperty(`${checksum}:manual:1`), rawData: {}, issues: [{ field: 'record', code: 'manual_transcription', message: 'Manuelle Abschrift erforderlich; es wurde keine OCR ausgeführt.', severity: 'warning' }] }] : parsePropertyImport(bytes, format, checksum);
  } catch (error) {
    if (error instanceof ImportParseError) throw new ApiError(error.code, 422, error.message);
    throw error;
  }
  const stored = await putPrivateFile(bytes, mimeType, actor.organizationId);
  let batchId: string;
  try {
    batchId = await db.transaction(async tx => {
      const [batch] = await tx.insert(importBatches).values({ organizationId: actor.organizationId, createdBy: actor.user.id, sourceSystem,
        dataClass, format, originalName, mimeType, storageKey: stored.key, sha256: checksum, sizeBytes: bytes.byteLength }).returning();
      if (!batch) throw new Error('Batch insert failed');
      await tx.insert(importRecords).values(parsed.map(row => ({ organizationId: actor.organizationId, batchId: batch.id, sourceLine: row.sourceLine,
        sourceRecordId: row.data.sourceRecordId, rawData: row.rawData, data: row.data, sourceIssues: row.issues })));
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorId: actor.user.id, action: 'import.staged', entityType: 'import_batch', entityId: batch.id,
        after: { format, recordCount: parsed.length, dataClass, sourceSystem } });
      return batch.id;
    });
  } catch (error) { await deletePrivateFile(stored.key); throw error; }
  return getImportReview(actor, batchId);
}

const editablePropertySchema = importPropertySchema.extend({ postalCode: z.string().max(20).nullable() });
const reviewPatchSchema = z.object({
  revision: z.number().int().positive(),
  records: z.array(z.object({ id: z.uuid().optional(), revision: z.number().int().positive().optional(), sourceLine: z.number().int().positive(),
    included: z.boolean(), confirmed: z.boolean(), data: editablePropertySchema }).strict()).min(1).max(MAX_IMPORT_ROWS),
}).strict();

async function readReviewPatch(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte JSON verwenden.');
  const bytes = await readLimitedBytes(request, MAX_IMPORT_BYTES);
  return reviewPatchSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

export async function updateImport(request: Request, actor: Actor, id: string): Promise<ImportReviewDto> {
  await loadBatch(actor, id);
  const input = await readReviewPatch(request);
  await db.transaction(async tx => {
    const [batch] = await tx.select().from(importBatches).where(and(eq(importBatches.organizationId, actor.organizationId), eq(importBatches.id, id))).for('update');
    if (!batch) throw new ApiError('NOT_FOUND', 404, 'Import nicht gefunden.');
    if (batch.status === 'imported') throw new ApiError('IMPORT_IMMUTABLE', 409, 'Dieser Import wurde bereits übernommen und bleibt unverändert.');
    if (batch.revision !== input.revision) throw new ApiError('REVISION_CONFLICT', 409, 'Der Import wurde zwischenzeitlich bearbeitet. Bitte neu laden.');
    const oldRows = await tx.select().from(importRecords).where(and(eq(importRecords.organizationId, actor.organizationId), eq(importRecords.batchId, id)));
    const oldIds = new Set(oldRows.map(row => row.id));
    if (new Set(input.records.map(row => row.sourceLine)).size !== input.records.length) throw new ApiError('DUPLICATE_LINE', 422, 'Quellzeilen müssen eindeutig sein.');
    if (input.records.filter(row => row.id).length !== oldRows.length || input.records.some(row => row.id && !oldIds.has(row.id)) || oldRows.some(row => !input.records.some(next => next.id === row.id))) throw new ApiError('RECORD_SCOPE', 422, 'Vorhandene Quellzeilen dürfen nicht entfernt oder ersetzt werden. Bitte bei Bedarf auslassen.');
    if (input.records.some(row => !row.id) && batch.format !== 'screenshot') throw new ApiError('RECORD_SCOPE', 422, 'Zusätzliche Zeilen sind nur für die manuelle Screenshot-Abschrift vorgesehen.');
    for (const row of input.records) {
      if (row.id) {
        const previous = oldRows.find(item => item.id === row.id)!;
        if (row.revision !== previous.revision || row.sourceLine !== previous.sourceLine) throw new ApiError('REVISION_CONFLICT', 409, 'Eine Quellzeile wurde zwischenzeitlich geändert. Bitte neu laden.');
        await tx.update(importRecords).set({ data: row.data, sourceRecordId: row.data.sourceRecordId, included: row.included, confirmed: row.confirmed,
          revision: previous.revision + 1, updatedAt: new Date() }).where(and(eq(importRecords.organizationId, actor.organizationId), eq(importRecords.id, row.id)));
      } else await tx.insert(importRecords).values({ organizationId: actor.organizationId, batchId: id, sourceLine: row.sourceLine,
        sourceRecordId: row.data.sourceRecordId, rawData: {}, data: row.data, included: row.included, confirmed: row.confirmed });
    }
    await tx.update(importBatches).set({ revision: batch.revision + 1, updatedAt: new Date() }).where(eq(importBatches.id, id));
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorId: actor.user.id, action: 'import.review_saved', entityType: 'import_batch', entityId: id,
      before: { revision: batch.revision }, after: { revision: batch.revision + 1, recordCount: input.records.length, confirmedRows: input.records.filter(row => row.confirmed && row.included).length } });
  });
  return getImportReview(actor, id);
}

export async function commitImport(actor: Actor, id: string, expectedRevision: number): Promise<ImportReviewDto> {
  await loadBatch(actor, id);
  await db.transaction(async tx => {
    // Serializes imports per organization, including duplicate checks across batches.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.organizationId}))`);
    const [batch] = await tx.select().from(importBatches).where(and(eq(importBatches.organizationId, actor.organizationId), eq(importBatches.id, id))).for('update');
    if (!batch) throw new ApiError('NOT_FOUND', 404, 'Import nicht gefunden.');
    if (batch.status === 'imported') return;
    if (batch.revision !== expectedRevision) throw new ApiError('REVISION_CONFLICT', 409, 'Die Vorschau hat sich geändert. Bitte neu laden und erneut prüfen.');
    const [rows, existing] = await Promise.all([
      tx.select().from(importRecords).where(and(eq(importRecords.organizationId, actor.organizationId), eq(importRecords.batchId, id))).orderBy(importRecords.sourceLine),
      tx.select().from(properties).where(eq(properties.organizationId, actor.organizationId)).for('update'),
    ]);
    const review = renderReview(batch, rows, existing);
    if (review.summary.invalid || review.summary.conflict || review.summary.unconfirmed || review.summary.excluded === review.summary.total) throw new ApiError('IMPORT_NOT_READY', 422, 'Bitte alle ausgewählten Zeilen prüfen und bestätigen. Fehler und Konflikte müssen zuvor geklärt oder ausgelassen werden.');
    let created = 0, unchanged = 0;
    for (const row of review.records.filter(record => record.included)) {
      let propertyId = row.change.existingPropertyId;
      if (row.change.kind === 'new') {
        const desired = desiredProperty(row.data, batch.sourceSystem, batch.dataClass);
        const [property] = await tx.insert(properties).values({ ...desired, organizationId: actor.organizationId, geoStatus: 'missing' }).returning();
        if (!property) throw new Error('Property insert failed');
        propertyId = property.id; created++;
        await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId, actorId: actor.user.id, action: 'property.imported', entityType: 'property', entityId: propertyId,
          after: { ...desired, batchId: id, sourceLine: row.sourceLine, reportedCounts: { total: row.data.reportedUnitCount, residential: row.data.reportedResidentialCount, parking: row.data.reportedParkingCount } } });
      } else unchanged++;
      await tx.update(importRecords).set({ propertyId }).where(and(eq(importRecords.organizationId, actor.organizationId), eq(importRecords.id, row.id)));
    }
    const report = { created, unchanged, excluded: review.summary.excluded, totalSourceRows: review.summary.total, noAutomaticGeocoding: true, noUnitsCreatedFromCounts: true };
    await tx.update(importBatches).set({ status: 'imported', revision: batch.revision + 1, importedAt: new Date(), importedBy: actor.user.id, report, updatedAt: new Date() }).where(and(eq(importBatches.organizationId, actor.organizationId), eq(importBatches.id, id)));
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorId: actor.user.id, action: 'import.committed', entityType: 'import_batch', entityId: id, after: report });
  });
  return getImportReview(actor, id);
}
