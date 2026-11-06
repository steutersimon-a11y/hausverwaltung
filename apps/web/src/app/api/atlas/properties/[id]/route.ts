import { apiRoute, jsonResponse } from '@/lib/server/http';
import { requireActor } from '@/lib/server/security';
import { getProperty } from '@/lib/server/portfolio';

export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  return jsonResponse(await getProperty(await requireActor(request), (await context.params).id));
});
