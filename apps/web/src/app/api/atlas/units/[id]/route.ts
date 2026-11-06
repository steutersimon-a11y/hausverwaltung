import { apiRoute, jsonResponse, readJson } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import { getUnit } from '@/lib/server/portfolio';
import { archiveUnit, archiveUnitSchema, updateUnit, updateUnitSchema } from '@/lib/server/units';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export const GET = apiRoute(async (request: Request, context: Context) => jsonResponse(await getUnit(await requireActor(request), (await context.params).id)));
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  return jsonResponse(await updateUnit(actor, (await context.params).id, await readJson(request, updateUnitSchema)));
});
export const DELETE = apiRoute(async (request: Request, context: Context) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  const { revision } = await readJson(request, archiveUnitSchema);
  return jsonResponse(await archiveUnit(actor, (await context.params).id, revision));
});
