import { z } from 'zod';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

const optionalText = (max: number) => z.string().trim().max(max).nullable();
export const importPropertySchema = z.object({
  sourceRecordId: z.string().trim().min(1).max(160),
  code: optionalText(80),
  name: optionalText(160),
  street: optionalText(160),
  houseNumber: optionalText(24),
  postalCode: z.string().regex(/^\d{5}$/, 'PLZ muss aus fünf Ziffern bestehen.').nullable(),
  city: optionalText(120),
  managementType: z.enum(['rental', 'weg', 'mixed']).nullable(),
  note: z.string().max(4000),
  reportedUnitCount: z.number().int().min(0).max(100000).nullable(),
  reportedResidentialCount: z.number().int().min(0).max(100000).nullable(),
  reportedParkingCount: z.number().int().min(0).max(100000).nullable(),
}).strict();

export type ImportProperty = z.infer<typeof importPropertySchema>;
export type ImportIssue = {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
};
export type ParsedImportRow = {
  sourceLine: number;
  data: ImportProperty;
  rawData: Record<string, string | number | null>;
  issues: ImportIssue[];
};
export type ImportFormat = 'csv' | 'json' | 'screenshot';

export class ImportParseError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const aliases: Record<string, keyof ImportProperty> = {
  sourcerecordid: 'sourceRecordId', sourceid: 'sourceRecordId', quellid: 'sourceRecordId', externeid: 'sourceRecordId',
  code: 'code', objektid: 'code', objektnummer: 'code', objektcode: 'code', propertycode: 'code',
  name: 'name', objektname: 'name', bezeichnung: 'name', propertyname: 'name',
  street: 'street', strasse: 'street', str: 'street',
  housenumber: 'houseNumber', hausnummer: 'houseNumber', hausnr: 'houseNumber',
  postalcode: 'postalCode', plz: 'postalCode', postleitzahl: 'postalCode',
  city: 'city', ort: 'city', stadt: 'city',
  managementtype: 'managementType', verwaltungsart: 'managementType',
  note: 'note', notiz: 'note', hinweis: 'note',
  reportedunitcount: 'reportedUnitCount', einh: 'reportedUnitCount', einheiten: 'reportedUnitCount',
  reportedresidentialcount: 'reportedResidentialCount', we: 'reportedResidentialCount', wohneinheiten: 'reportedResidentialCount',
  reportedparkingcount: 'reportedParkingCount', gast: 'reportedParkingCount', garagenstellplaetze: 'reportedParkingCount',
};

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

function text(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result || null;
}

export function hasSpreadsheetFormula(value: unknown): boolean {
  return typeof value === 'string' && /^[=+@\-]/.test(value.trimStart());
}

function count(value: unknown): number | null {
  const raw = text(value);
  if (!raw || raw === '?') return null;
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

export function emptyImportProperty(sourceRecordId: string): ImportProperty {
  return { sourceRecordId, code: null, name: null, street: null, houseNumber: null, postalCode: null, city: null,
    managementType: null, note: '', reportedUnitCount: null, reportedResidentialCount: null, reportedParkingCount: null };
}

export function validateImportProperty(data: ImportProperty): ImportIssue[] {
  const result = importPropertySchema.safeParse(data);
  const issues: ImportIssue[] = result.success ? [] : result.error.issues.map(issue => ({
    field: String(issue.path[0] ?? 'record'), code: 'invalid', message: issue.message, severity: 'error' as const,
  }));
  for (const [field, value] of Object.entries(data)) {
    if (hasSpreadsheetFormula(value)) issues.push({ field, code: 'formula', message: 'Formelähnlicher Zellinhalt ist nicht zulässig.', severity: 'error' });
  }
  if (!data.name && !data.code && !data.street) issues.push({ field: 'name', code: 'identity_missing', message: 'Bezeichnung, Objektcode oder Straße zur Identifikation ergänzen.', severity: 'error' });
  if (!data.managementType) issues.push({ field: 'managementType', code: 'management_type_missing', message: 'Verwaltungsart ausdrücklich auswählen; sie wird nicht aus der Adresse abgeleitet.', severity: 'error' });
  if (!data.street || !data.houseNumber || !data.postalCode || !data.city) issues.push({ field: 'address', code: 'address_incomplete', message: 'Adresse unvollständig. Das Objekt bleibt ohne Standort in der Klärungsliste.', severity: 'warning' });
  return issues;
}

function normalizeRow(raw: Record<string, unknown>, sourceLine: number, sourcePrefix: string): ParsedImportRow {
  const canonical: Record<string, unknown> = {};
  const rawData: Record<string, string | number | null> = {};
  const issues: ImportIssue[] = [];
  // PostgreSQL JSONB rejects NUL and unpaired UTF-16 surrogates. Report bad
  // source content before storage rather than turning it into a database error.
  const invalidUnicode = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const [key, value] of Object.entries(raw)) {
    if (invalidUnicode.test(key) || (typeof value === 'string' && invalidUnicode.test(value))) throw new ImportParseError('INVALID_UNICODE', 'Die Quelle enthält ungültige Unicode- oder Nullzeichen.');
    if (key.length > 160) throw new ImportParseError('HEADER_TOO_LONG', 'Eine Spaltenüberschrift ist zu lang.');
    if (value != null && typeof value !== 'string' && typeof value !== 'number') throw new ImportParseError('NESTED_VALUE', 'Importfelder dürfen nur Text, Zahlen oder null enthalten.');
    if (typeof value === 'string' && value.length > 4000) throw new ImportParseError('CELL_TOO_LONG', 'Ein Zellinhalt überschreitet 4.000 Zeichen.');
    rawData[key] = value == null ? null : value as string | number;
    if (hasSpreadsheetFormula(value)) issues.push({ field: key, code: 'formula', message: 'Formelähnlicher Zellinhalt ist nicht zulässig.', severity: 'error' });
    const field = aliases[headerKey(key)];
    if (field) {
      if (Object.hasOwn(canonical, field)) throw new ImportParseError('DUPLICATE_MAPPING', 'Mehrere Spalten sind demselben Zielfeld zugeordnet. Bitte die Quelldatei korrigieren.');
      canonical[field] = value;
    }
  }
  const data = emptyImportProperty(text(canonical.sourceRecordId) ?? text(canonical.code) ?? `${sourcePrefix}:line:${sourceLine}`);
  for (const field of ['code', 'name', 'street', 'houseNumber', 'postalCode', 'city'] as const) data[field] = text(canonical[field]);
  data.note = text(canonical.note) ?? '';
  const type = text(canonical.managementType)?.toLowerCase();
  if (type && ['weg', 'rental', 'mixed'].includes(type)) data.managementType = type as ImportProperty['managementType'];
  else if (type && ['mietverwaltung', 'miete'].includes(type)) data.managementType = 'rental';
  else if (type && ['gemischt', 'kombination'].includes(type)) data.managementType = 'mixed';
  else if (type) issues.push({ field: 'managementType', code: 'invalid', message: 'Verwaltungsart muss rental, weg oder mixed sein.', severity: 'error' });
  for (const field of ['reportedUnitCount', 'reportedResidentialCount', 'reportedParkingCount'] as const) {
    const parsed = count(canonical[field]);
    if (Number.isNaN(parsed)) issues.push({ field, code: 'invalid_count', message: 'Einheitenzahlen müssen nichtnegative ganze Zahlen sein.', severity: 'error' });
    data[field] = Number.isNaN(parsed) ? null : parsed;
    if (text(canonical[field]) === '?') issues.push({ field, code: 'unknown_count', message: 'Fragezeichen in der Quelle; Wert bleibt unbekannt.', severity: 'warning' });
  }
  return { sourceLine, data, rawData, issues: [...issues, ...validateImportProperty(data)] };
}

export function parseCsv(textInput: string): string[][] {
  const input = textInput.replace(/^\uFEFF/, '');
  if (input.includes('\0')) throw new ImportParseError('BINARY_CONTENT', 'Die Datei enthält ungültige Binärzeichen.');
  const header = input.split(/\r?\n/, 1)[0] ?? '';
  const countOutsideQuotes = (delimiter: string) => {
    let quoted = false, total = 0;
    for (let index = 0; index < header.length; index++) {
      if (header[index] === '"') { if (quoted && header[index + 1] === '"') index++; else quoted = !quoted; }
      else if (!quoted && header[index] === delimiter) total++;
    }
    return total;
  };
  const delimiters = [';', ',', '\t'];
  const delimiter = delimiters.reduce((best, current) => countOutsideQuotes(current) > countOutsideQuotes(best) ? current : best);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closedQuote = false;
  function addCell() {
    if (cell.length > 4000) throw new ImportParseError('CELL_TOO_LONG', 'Ein Zellinhalt überschreitet 4.000 Zeichen.');
    row.push(cell); cell = ''; closedQuote = false;
    if (row.length > 30) throw new ImportParseError('TOO_MANY_COLUMNS', 'Maximal 30 Spalten pro Import sind erlaubt.');
  }
  function addRow() {
    addCell();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_IMPORT_ROWS + 1) throw new ImportParseError('TOO_MANY_ROWS', `Maximal ${MAX_IMPORT_ROWS} Datenzeilen pro Import sind erlaubt.`);
  }
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') { if (input[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closedQuote = true; } }
      else cell += char;
    } else if (char === '"') {
      if (cell.length || closedQuote) throw new ImportParseError('INVALID_CSV', 'Anführungszeichen sind in dieser CSV nicht korrekt gesetzt.');
      quoted = true;
    } else if (char === delimiter) addCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && input[index + 1] === '\n') index++; addRow(); }
    else { if (closedQuote && char.trim()) throw new ImportParseError('INVALID_CSV', 'Nach einem geschlossenen Textfeld steht unerwarteter Inhalt.'); cell += char; }
  }
  if (quoted) throw new ImportParseError('INVALID_CSV', 'Ein Textfeld wurde nicht mit Anführungszeichen geschlossen.');
  if (cell || row.length) addRow();
  return rows;
}

export function parsePropertyImport(bytes: Uint8Array, format: 'csv' | 'json', sourcePrefix: string): ParsedImportRow[] {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMPORT_BYTES) throw new ImportParseError('FILE_SIZE', 'Die Importdatei muss zwischen 1 Byte und 5 MB groß sein.');
  let input: string;
  try { input = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ImportParseError('ENCODING', 'Die Datei muss UTF-8-kodiert sein.'); }
  let records: Record<string, unknown>[];
  if (format === 'csv') {
    const table = parseCsv(input);
    const headers = table.shift();
    if (!headers?.length) throw new ImportParseError('NO_HEADER', 'Die CSV benötigt eine Kopfzeile.');
    const seenHeaders = new Set<string>();
    for (const header of headers) {
      const key = headerKey(header);
      if (!key || seenHeaders.has(key)) throw new ImportParseError('DUPLICATE_HEADER', 'Spaltenüberschriften müssen eindeutig und nicht leer sein.');
      seenHeaders.add(key);
    }
    if (!headers.some(header => aliases[headerKey(header)])) throw new ImportParseError('NO_MAPPING', 'Keine unterstützten Spalten gefunden. Verwende die Beispiel-CSV.');
    records = table.map(row => {
      if (row.length !== headers.length) throw new ImportParseError('COLUMN_COUNT', 'Eine Zeile hat eine andere Spaltenzahl als die Kopfzeile.');
      return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]));
    });
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(input.replace(/^\uFEFF/, '')); } catch { throw new ImportParseError('INVALID_JSON', 'Die Datei enthält kein gültiges JSON.'); }
    const collection = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null && 'records' in parsed ? (parsed as { records: unknown }).records : null;
    if (!Array.isArray(collection) || collection.some(row => !row || Array.isArray(row) || typeof row !== 'object')) throw new ImportParseError('INVALID_JSON', 'JSON muss eine Liste von Objekten oder {"records": [...]} enthalten.');
    records = collection as Record<string, unknown>[];
    if (records.some(record => Object.keys(record).length > 30)) throw new ImportParseError('TOO_MANY_COLUMNS', 'Maximal 30 Felder pro Datensatz sind erlaubt.');
  }
  if (!records.length || records.length > MAX_IMPORT_ROWS) throw new ImportParseError('ROW_COUNT', `Der Import benötigt 1 bis ${MAX_IMPORT_ROWS} Datenzeilen.`);
  const result = records.map((raw, index) => normalizeRow(raw, index + (format === 'csv' ? 2 : 1), sourcePrefix));
  const ids = new Set<string>();
  for (const row of result) {
    if (ids.has(row.data.sourceRecordId)) row.issues.push({ field: 'sourceRecordId', code: 'duplicate_source_id', message: 'Quell-ID kommt mehrfach in diesem Import vor.', severity: 'error' });
    ids.add(row.data.sourceRecordId);
  }
  return result;
}

export function propertyAddressFingerprint(record: Pick<ImportProperty, 'street' | 'houseNumber' | 'postalCode' | 'city'>): string | null {
  if (!record.street || !record.houseNumber || !record.postalCode || !record.city) return null;
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/ß/g, 'ss').replace(/[\s.,-]+/g, '');
  return [record.street, record.houseNumber, record.postalCode, record.city].map(normalize).join('|');
}
