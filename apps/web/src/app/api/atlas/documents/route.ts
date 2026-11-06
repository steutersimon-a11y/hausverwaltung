import { apiRoute, ApiError, jsonResponse, readMultipart } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import { createDocument, documentFieldsSchema, documentQuerySchema, listDocuments } from '@/lib/server/documents';
import { MAX_DOCUMENT_BYTES } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request) => {
  const actor = await requireActor(request);
  const query = documentQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return jsonResponse(await listDocuments(actor, query));
});
export const POST = apiRoute(async (request: Request) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  if (actor.role === 'viewer') throw new ApiError('FORBIDDEN', 403, 'Du hast nur Leserechte.');
  const form = await readMultipart(request, MAX_DOCUMENT_BYTES + 128 * 1024);
  const file = form.get('file');
  if (!(file instanceof File) || form.getAll('file').length !== 1) throw new ApiError('FILE_REQUIRED', 422, 'Bitte genau eine Datei auswählen.');
  const fields = documentFieldsSchema.parse({ propertyId: form.get('propertyId'), unitId: form.get('unitId') || undefined, kind: form.get('kind') || 'document', title: form.get('title') || undefined });
  return jsonResponse(await createDocument(actor, file, fields), 201);
});
