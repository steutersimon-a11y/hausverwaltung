import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Never put input payloads, SQL, person names or storage keys into client errors/logs. */
export function apiRoute<T extends unknown[]>(handler: (...args: T) => Promise<Response>): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
      }
      if (error instanceof z.ZodError) {
        return jsonResponse({ error: { code: 'VALIDATION', message: 'Bitte prüfe die markierten Angaben.', issues: error.issues.map(i => ({ path: i.path, message: i.message })) } }, 422);
      }
      if (error instanceof SyntaxError) return jsonResponse({ error: { code: 'INVALID_JSON', message: 'Die Eingabe ist kein gültiges JSON.' } }, 400);
      let databaseFailure: unknown = error;
      let databaseCode = '';
      for (let depth = 0; depth < 3 && databaseFailure && typeof databaseFailure === 'object'; depth++) {
        if ('code' in databaseFailure && typeof databaseFailure.code === 'string') { databaseCode = databaseFailure.code; break; }
        databaseFailure = 'cause' in databaseFailure ? databaseFailure.cause : undefined;
      }
      if (databaseCode === '23505') return jsonResponse({ error: { code: 'DUPLICATE', message: 'Ein Datensatz mit diesem eindeutigen Kennzeichen ist bereits vorhanden.' } }, 409);
      if (databaseCode === '23503' || databaseCode === '23514') return jsonResponse({ error: { code: 'DATA_CONFLICT', message: 'Die Änderung passt nicht zum aktuellen Datenbestand. Bitte lade die Daten neu.' } }, 409);
      const requestId = randomUUID();
      console.error(JSON.stringify({ event: 'atlas.api.error', requestId, type: error instanceof Error ? error.name : 'UnknownError', databaseCode: /^[A-Z0-9]{5}$/.test(databaseCode) ? databaseCode : undefined }));
      return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: `Die Anfrage konnte nicht verarbeitet werden. Referenz: ${requestId}` } }, 500);
    }
  };
}

export async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ApiError('UPLOAD_TOO_LARGE', 413, 'Die Datei oder Anfrage ist zu groß.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError('UPLOAD_TOO_LARGE', 413, 'Die Datei oder Anfrage ist zu groß.');
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte JSON als Inhaltstyp verwenden.');
  const bytes = await readLimitedBytes(request, 64 * 1024);
  return schema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

export async function readMultipart(request: Request, maxBytes: number): Promise<FormData> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte eine Datei als Formular hochladen.');
  const bytes = await readLimitedBytes(request, maxBytes);
  try {
    return await new Response(Buffer.from(bytes), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
  } catch {
    throw new ApiError('INVALID_MULTIPART', 400, 'Das Dateiformular konnte nicht gelesen werden.');
  }
}

export const idSchema = z.uuid();
