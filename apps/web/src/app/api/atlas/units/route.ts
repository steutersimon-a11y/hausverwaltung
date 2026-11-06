import { apiRoute, jsonResponse, readJson } from '@/lib/server/http';
import { assertMutationOrigin, enforceWriteRateLimit, requireActor } from '@/lib/server/security';
import { createUnit, createUnitSchema } from '@/lib/server/units';

export const runtime = 'nodejs';
export const POST = apiRoute(async (request: Request) => {
  assertMutationOrigin(request);
  const actor = await requireActor(request); await enforceWriteRateLimit(actor);
  return jsonResponse(await createUnit(actor, await readJson(request, createUnitSchema)), 201);
});
