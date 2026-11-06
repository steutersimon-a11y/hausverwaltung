import {
  emptyImportProperty, importPropertySchema, ImportParseError, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS,
  parsePropertyImport, propertyAddressFingerprint, validateImportProperty,
} from '../../../packages/integrations/src/imports';
import type { ImportIssue, ImportProperty, ParsedImportRow } from '../../../packages/integrations/src/imports';
import type { ImportBatchDto, ImportRecordDto, ImportReviewDto } from '../../../packages/integrations/src/contracts';
import { ApiError, json } from './http';
import { appendAudit, loadState, updateState } from './store';
import type { Actor, AppState, Env, HostedProperty } from './types';

interface StoredRow extends Omit<ImportRecordDto, 'issues' | 'change'> { sourceIssues: ImportIssue[]; }
export interface StoredImport extends ImportBatchDto { storageKey: string; mimeType: string; sha256: string; sizeBytes: number; rows: StoredRow[]; }
interface PatchRow { id?: string; revision?: number; sourceLine: number; included: boolean; confirmed: boolean; data: ImportProperty; }
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const badUnicode = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const stored = (state: AppState): StoredImport[] => state.imports.filter((value): value is StoredImport => plain(value) && typeof value.id === 'string' && typeof value.storageKey === 'string' && Array.isArray(value.rows));
function batch(state: AppState, id: string): StoredImport {
  const value = stored(state).find(item => item.id === id);
  if (!value) throw new ApiError('NOT_FOUND', 404, 'Import nicht gefunden.');
  return value;
}
function dto(value: StoredImport): ImportBatchDto {
  return { id: value.id, sourceSystem: value.sourceSystem, dataClass: value.dataClass, format: value.format, originalName: value.originalName,
    status: value.status, revision: value.revision, createdAt: value.createdAt, importedAt: value.importedAt,
    recordCount: value.rows.length, sourceUrl: `/api/atlas/imports/${value.id}/source`, report: value.report };
}
async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map(value => value.toString(16).padStart(2, '0')).join('');
}
async function desired(data: ImportProperty, value: StoredImport) {
  const code = data.code ?? `IMP-${(await digest(new TextEncoder().encode(`${value.sourceSystem}\0${data.sourceRecordId}`))).slice(0, 12).toUpperCase()}`;
  return { code, name: data.name ?? `Objekt ${code}`, street: data.street, houseNumber: data.houseNumber, postalCode: data.postalCode, city: data.city,
    managementType: data.managementType, note: data.note, source: value.dataClass === 'synthetic' ? 'demo' as const : 'import' as const,
    sourceSystem: value.sourceSystem, sourceRecordId: data.sourceRecordId,
    reportedTotalUnits: data.reportedUnitCount, reportedResidentialUnits: data.reportedResidentialCount, reportedParkingUnits: data.reportedParkingCount };
}
/** Recompute against the latest workspace; cached previews never authorize a commit. */
export async function renderImportReview(state: AppState, value: StoredImport): Promise<ImportReviewDto> {
  const selected = value.rows.filter(row => row.included);
  const count = (key: (row: StoredRow) => string | null) => {
    const counts = new Map<string, number>();
    for (const row of selected) { const id = key(row); if (id) counts.set(id, (counts.get(id) ?? 0) + 1); }
    return counts;
  };
  const identities = count(row => row.data.sourceRecordId), codes = count(row => row.data.code?.toLocaleLowerCase('de-DE') ?? null);
  const addresses = count(row => propertyAddressFingerprint(row.data));
  const records = await Promise.all(value.rows.map(async row => {
    const issues = validateImportProperty(row.data);
    if (row.revision === 1) issues.push(...row.sourceIssues);
    const issue = (field: string, code: string, message: string) => issues.push({ field, code, message, severity: 'error' });
    if (row.included && (identities.get(row.data.sourceRecordId) ?? 0) > 1) issue('sourceRecordId', 'duplicate_source_id', 'Quell-ID mehrfach ausgewählt. Dublette korrigieren oder auslassen.');
    if (row.included && row.data.code && (codes.get(row.data.code.toLocaleLowerCase('de-DE')) ?? 0) > 1) issue('code', 'duplicate_code', 'Objektcode mehrfach ausgewählt.');
    const fingerprint = propertyAddressFingerprint(row.data);
    if (row.included && fingerprint && (addresses.get(fingerprint) ?? 0) > 1) issue('address', 'duplicate_address', 'Adresse mehrfach ausgewählt. Identität vor der Übernahme klären.');
    const target = state.properties.find(property => property.sourceSystem === value.sourceSystem && property.sourceRecordId === row.data.sourceRecordId);
    const next = await desired(row.data, value);
    const fields = target ? Object.entries(next).filter(([key, entry]) => (target[key as keyof HostedProperty] ?? null) !== entry)
      .map(([field, after]) => ({ field, before: target[field as keyof HostedProperty] ?? null, after })) : [];
    let kind: ImportRecordDto['change']['kind'] = 'new', existingPropertyId = target?.id ?? null;
    if (!row.included) kind = 'excluded';
    else if (issues.some(item => item.severity === 'error')) kind = 'invalid';
    else if (target) kind = fields.length || target.archivedAt ? 'conflict' : 'unchanged';
    else {
      const collision = state.properties.find(property => property.code.toLocaleLowerCase('de-DE') === next.code.toLocaleLowerCase('de-DE') || Boolean(fingerprint && propertyAddressFingerprint(property) === fingerprint));
      if (collision) { kind = 'conflict'; existingPropertyId = collision.id; }
    }
    if (kind === 'conflict') issue('record', 'existing_conflict', 'Konflikt mit dem Bestand. Es wird nichts überschrieben. Zeile korrigieren oder auslassen.');
    return { id: row.id, sourceLine: row.sourceLine, revision: row.revision, included: row.included, confirmed: row.confirmed, data: row.data, issues,
      change: { kind, existingPropertyId, fields } } satisfies ImportRecordDto;
  }));
  const summary: ImportReviewDto['summary'] = { total: records.length, new: 0, unchanged: 0, conflict: 0, invalid: 0, excluded: 0, warning: 0, unconfirmed: 0 };
  for (const record of records) {
    summary[record.change.kind]++;
    if (record.included && !record.confirmed) summary.unconfirmed++;
    if (record.included && record.issues.some(item => item.severity === 'warning')) summary.warning++;
  }
  return { batch: dto(value), records, summary };
}
async function readBytes(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError('FILE_SIZE', 413, 'Die Anfrage überschreitet die zulässige Größe.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('EMPTY_BODY', 400, 'Die Anfrage enthält keine Daten.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new ApiError('FILE_SIZE', 413, 'Die Anfrage überschreitet die zulässige Größe.'); }
    chunks.push(next.value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function readObject(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte JSON verwenden.');
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request, MAX_IMPORT_BYTES)));
    if (plain(value)) return value;
  } catch (error) { if (error instanceof ApiError) throw error; }
  throw new ApiError('INVALID_JSON', 422, 'Ungültige JSON-Anfrage.');
}
function patchRows(input: Record<string, unknown>): PatchRow[] {
  if (!exactKeys(input, ['revision', 'records']) || !positive(input.revision) || !Array.isArray(input.records) || !input.records.length || input.records.length > MAX_IMPORT_ROWS) throw new ApiError('INVALID_REVIEW', 422, 'Ungültige Review-Daten.');
  return input.records.map((row: unknown) => {
    if (!plain(row) || !exactKeys(row, ['id', 'revision', 'sourceLine', 'included', 'confirmed', 'data']) || !positive(row.sourceLine) || typeof row.included !== 'boolean' || typeof row.confirmed !== 'boolean' || !plain(row.data) ||
      (row.id !== undefined && (typeof row.id !== 'string' || !positive(row.revision)))) throw new ApiError('INVALID_REVIEW', 422, 'Ungültige Quellzeile.');
    const postalCode = row.data.postalCode;
    if (postalCode !== null && (typeof postalCode !== 'string' || postalCode.length > 20)) throw new ApiError('INVALID_REVIEW', 422, 'Ungültige Postleitzahl.');
    const result = importPropertySchema.safeParse({ ...row.data, postalCode: null });
    if (!result.success || Object.values(row.data).some(value => typeof value === 'string' && badUnicode.test(value))) throw new ApiError('INVALID_REVIEW', 422, 'Ungültige Felder in der Quellzeile.');
    return { id: row.id as string | undefined, revision: row.revision as number | undefined, sourceLine: row.sourceLine,
      included: row.included, confirmed: row.confirmed, data: { ...result.data, postalCode } };
  });
}
function imageMime(bytes: Uint8Array, extension: string): string | null {
  if (extension === 'png' && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (['jpg', 'jpeg'].includes(extension) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (extension === 'webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
async function stage(request: Request, env: Env, actor: Actor): Promise<ImportReviewDto> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data;')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte eine Datei als Multipart-Formular übertragen.');
  let form: FormData;
  try { form = await new Response(await readBytes(request, MAX_IMPORT_BYTES + 65536) as BodyInit, { headers: { 'content-type': contentType } }).formData(); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('INVALID_MULTIPART', 422, 'Dateiübertragung ungültig.'); }
  const file = form.get('file'), sourceSystem = form.get('sourceSystem') ?? 'manuell', dataClass = form.get('dataClass') ?? 'real';
  if (!(file instanceof File) || !file.size || file.size > MAX_IMPORT_BYTES) throw new ApiError('FILE_SIZE', 413, 'Bitte eine Datei mit höchstens 5 MB auswählen.');
  if (typeof sourceSystem !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(sourceSystem) || !['real', 'synthetic'].includes(String(dataClass))) throw new ApiError('INVALID_SOURCE', 422, 'Quellsystem oder Datenherkunft ungültig.');
  const originalName = file.name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, '_').slice(0, 180) || 'quelle';
  const extension = originalName.split('.').at(-1)?.toLowerCase() ?? '', bytes = new Uint8Array(await file.arrayBuffer());
  const mime = imageMime(bytes, extension), format = extension === 'csv' || extension === 'json' ? extension : mime ? 'screenshot' : null;
  if (!format) throw new ApiError('FILE_TYPE', 415, 'Erlaubt sind CSV, JSON und echte PNG-, JPEG- oder WebP-Bilder.');
  const sha256 = await digest(bytes); let parsed: ParsedImportRow[];
  try {
    parsed = format === 'screenshot' ? [{ sourceLine: 1, data: emptyImportProperty(`${sha256}:manual:1`), rawData: {},
      issues: [{ field: 'record', code: 'manual_transcription', severity: 'warning', message: 'Manuelle Abschrift erforderlich. Es wurde keine OCR ausgeführt.' }] }] : parsePropertyImport(bytes, format, sha256);
  } catch (error) { if (error instanceof ImportParseError) throw new ApiError(error.code, 422, error.message); throw error; }
  const id = crypto.randomUUID(), storageKey = `imports/${id}/${crypto.randomUUID()}`, mimeType = mime ?? (format === 'csv' ? 'text/csv' : 'application/json');
  const value: StoredImport = { id, storageKey, mimeType, sha256, sizeBytes: bytes.byteLength, sourceSystem, dataClass: dataClass as 'real' | 'synthetic', format, originalName,
    status: 'review', revision: 1, createdAt: new Date().toISOString(), importedAt: null, recordCount: parsed.length, sourceUrl: `/api/atlas/imports/${id}/source`, report: null,
    rows: parsed.map(row => ({ id: crypto.randomUUID(), sourceLine: row.sourceLine, data: row.data, sourceIssues: row.issues, revision: 1, included: true, confirmed: false })) };
  await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: mimeType } });
  try {
    return await updateState(env, async state => {
      state.imports.push(value);
      appendAudit(state, actor, 'import.staged', 'import_batch', id, null, { format, recordCount: parsed.length, sourceSystem, dataClass });
      return renderImportReview(state, value);
    });
  } catch (error) { await env.BUCKET.delete?.(storageKey).catch(() => undefined); throw error; }
}
async function patch(request: Request, env: Env, actor: Actor, id: string): Promise<ImportReviewDto> {
  const input = await readObject(request), rows = patchRows(input);
  return updateState(env, async state => {
    const value = batch(state, id);
    if (value.status === 'imported') throw new ApiError('IMPORT_IMMUTABLE', 409, 'Dieser Import wurde bereits übernommen und bleibt unverändert.');
    if (value.revision !== input.revision) throw new ApiError('REVISION_CONFLICT', 409, 'Der Import wurde zwischenzeitlich bearbeitet. Bitte neu laden.');
    if (new Set(rows.map(row => row.sourceLine)).size !== rows.length || new Set(rows.filter(row => row.id).map(row => row.id)).size !== value.rows.length || rows.filter(row => row.id).length !== value.rows.length ||
      value.rows.some(row => !rows.some(next => next.id === row.id)) || rows.some(row => row.id && !value.rows.some(old => old.id === row.id)) || rows.some(row => !row.id) && value.format !== 'screenshot') throw new ApiError('RECORD_SCOPE', 422, 'Vorhandene Zeilen dürfen nicht ersetzt oder entfernt werden. Zusätzliche Zeilen sind nur bei Screenshots möglich.');
    value.rows = rows.map(row => {
      const previous = value.rows.find(old => old.id === row.id);
      if (previous && (previous.revision !== row.revision || previous.sourceLine !== row.sourceLine)) throw new ApiError('REVISION_CONFLICT', 409, 'Eine Quellzeile wurde zwischenzeitlich geändert.');
      return { ...row, id: previous?.id ?? crypto.randomUUID(), revision: (previous?.revision ?? 0) + 1, sourceIssues: previous?.sourceIssues ?? [] };
    });
    value.revision++;
    appendAudit(state, actor, 'import.review_saved', 'import_batch', id, { revision: value.revision - 1 }, { revision: value.revision, recordCount: rows.length });
    return renderImportReview(state, value);
  });
}
async function commit(request: Request, env: Env, actor: Actor, id: string): Promise<ImportReviewDto> {
  const input = await readObject(request);
  if (!exactKeys(input, ['revision', 'confirmed']) || !positive(input.revision) || input.confirmed !== true) throw new ApiError('INVALID_CONFIRMATION', 422, 'Die geprüfte Revision ausdrücklich bestätigen.');
  return updateState(env, async state => {
    const value = batch(state, id);
    if (value.status === 'imported') return renderImportReview(state, value);
    if (value.revision !== input.revision) throw new ApiError('REVISION_CONFLICT', 409, 'Die Vorschau hat sich geändert. Bitte neu laden.');
    const review = await renderImportReview(state, value);
    if (review.summary.invalid || review.summary.conflict || review.summary.unconfirmed || review.summary.excluded === review.summary.total) throw new ApiError('IMPORT_NOT_READY', 422, 'Alle ausgewählten Zeilen prüfen und bestätigen. Fehler und Konflikte zuvor klären oder auslassen.');
    let created = 0, unchanged = 0;
    for (const row of review.records.filter(record => record.included)) {
      if (row.change.kind !== 'new') { unchanged++; continue; }
      const data = await desired(row.data, value), propertyId = crypto.randomUUID();
      state.properties.push({ ...data, id: propertyId, latitude: null, longitude: null, geoStatus: 'missing', footprint: null, revision: 1, buildings: [],
        sourceLine: row.sourceLine, sourceLabel: value.originalName, archivedAt: null });
      appendAudit(state, actor, 'property.imported', 'property', propertyId, null, { ...data, batchId: id, sourceLine: row.sourceLine }, propertyId);
      created++;
    }
    value.status = 'imported'; value.revision++; value.importedAt = new Date().toISOString();
    value.report = { created, unchanged, excluded: review.summary.excluded, totalSourceRows: review.summary.total, noAutomaticGeocoding: true, noUnitsCreatedFromCounts: true };
    appendAudit(state, actor, 'import.committed', 'import_batch', id, null, value.report);
    return renderImportReview(state, value);
  });
}
/** Outer API authenticates the owner; every source lookup remains inside that workspace state. */
export async function handleImports(request: Request, url: URL, env: Env, actor: Actor): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/atlas/imports')) return null;
  const match = /^\/api\/atlas\/imports(?:\/([a-zA-Z0-9_-]{1,80})(?:\/(source|commit))?)?\/?$/.exec(url.pathname);
  if (!match) throw new ApiError('NOT_FOUND', 404, 'Import nicht gefunden.');
  const [, id, action] = match;
  const origin = request.headers.get('origin');
  if (!['GET', 'HEAD'].includes(request.method) && (request.headers.get('sec-fetch-site') === 'cross-site' || (origin ? origin !== url.origin : actor.id !== 'service-admin'))) throw new ApiError('CSRF', 403, 'Die Anfrage stammt nicht aus der Anwendung.');
  if (!id && request.method === 'POST') return json(await stage(request, env, actor), 201);
  if (id && !action && request.method === 'PATCH') return json(await patch(request, env, actor, id));
  if (id && action === 'commit' && request.method === 'POST') return json(await commit(request, env, actor, id));
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new ApiError('METHOD_NOT_ALLOWED', 405, 'Methode nicht erlaubt.');
  const { state } = await loadState(env);
  if (!id) return json({ batches: stored(state).slice().reverse().slice(0, 100).map(dto) });
  const value = batch(state, id);
  if (action === 'source') {
    const object = await env.BUCKET.get(value.storageKey);
    if (!object) throw new ApiError('NOT_FOUND', 404, 'Importquelle nicht gefunden.');
    return new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'content-type': value.mimeType, 'content-length': String(object.size),
      'content-disposition': `${value.format === 'screenshot' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(value.originalName)}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  }
  if (action) throw new ApiError('METHOD_NOT_ALLOWED', 405, 'Methode nicht erlaubt.');
  return json(await renderImportReview(state, value));
}
