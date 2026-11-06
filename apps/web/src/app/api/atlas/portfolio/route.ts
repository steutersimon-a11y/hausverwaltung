import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/http';
import { requireActor } from '@/lib/server/security';
import { getPortfolio } from '@/lib/server/portfolio';

export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request) => {
  const actor = await requireActor(request);
  const search = new URL(request.url).searchParams;
  const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(250), offset: z.coerce.number().int().min(0).max(100_000).default(0) }).parse(Object.fromEntries(search));
  return jsonResponse(await getPortfolio(actor, query.limit, query.offset));
});
