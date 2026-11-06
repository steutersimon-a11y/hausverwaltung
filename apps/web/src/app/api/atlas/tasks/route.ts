import { apiRoute, jsonResponse, readJson } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import { createTask, createTaskSchema, listTasks, taskQuerySchema } from '@/lib/server/tasks';

export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request) => jsonResponse(await listTasks(await requireActor(request), taskQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)))));
export const POST = apiRoute(async (request: Request) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  return jsonResponse(await createTask(actor, await readJson(request, createTaskSchema)), 201);
});
