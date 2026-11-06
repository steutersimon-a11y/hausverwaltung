import { z } from 'zod';
import { apiRoute, ApiError, idSchema, jsonResponse, readMultipart } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import { addDocumentVersion } from '@/lib/server/documents';
import { MAX_DOCUMENT_BYTES } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const POST = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  const id = idSchema.parse((await context.params).id);
  const form = await readMultipart(request, MAX_DOCUMENT_BYTES + 128 * 1024);
  const file = form.get('file');
  if (!(file instanceof File) || form.getAll('file').length !== 1) throw new ApiError('FILE_REQUIRED', 422, 'Bitte genau eine Datei auswählen.');
  const version = z.coerce.number().int().positive().parse(form.get('expectedVersion'));
  return jsonResponse(await addDocumentVersion(actor, id, version, file), 201);
});
