export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte JSON übermitteln.');
  if (Number(request.headers.get('content-length') ?? 0) > 2_000_000) throw new ApiError('BODY_SIZE', 413, 'Die Anfrage ist zu groß.');
  const bytes = await readBounded(request, 2_000_000);
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new ApiError('INVALID_JSON', 422, 'Die JSON-Daten sind ungültig.'); }
}
export async function readBounded(request: Request, max: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
    if (size > max) { await reader.cancel(); throw new ApiError('BODY_SIZE', 413, 'Die Anfrage ist zu groß.'); } chunks.push(item.value); }
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result;
}
export async function readMultipart(request: Request, max = 16 * 1024 * 1024): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data;')) throw new ApiError('CONTENT_TYPE', 415, 'Bitte eine Datei hochladen.');
  const bytes = await readBounded(request, max);
  try { return await new Response(bytes as BodyInit, { headers: { 'content-type': type } }).formData(); }
  catch { throw new ApiError('INVALID_MULTIPART', 422, 'Der Dateiupload ist ungültig.'); }
}
