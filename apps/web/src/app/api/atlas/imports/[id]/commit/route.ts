import { z } from 'zod';
import { apiRoute, jsonResponse, readJson } from '@/lib/server/http';
import { commitImport, importActor } from '../../_service';

type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
export const POST = apiRoute(async (request: Request, context: Context) => {
  const actor = await importActor(request, true);
  const input = await readJson(request, z.object({ revision: z.number().int().positive(), confirmed: z.literal(true) }).strict());
  return jsonResponse(await commitImport(actor, (await context.params).id, input.revision));
});
