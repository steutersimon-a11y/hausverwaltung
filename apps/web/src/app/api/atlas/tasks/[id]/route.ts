import { apiRoute, idSchema, jsonResponse, readJson } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import { updateTask, updateTaskSchema } from '@/lib/server/tasks';

export const runtime = 'nodejs';
export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  return jsonResponse(await updateTask(actor, idSchema.parse((await context.params).id), await readJson(request, updateTaskSchema)));
});
