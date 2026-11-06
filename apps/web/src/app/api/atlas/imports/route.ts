import { apiRoute, jsonResponse } from '@/lib/server/http';
import { createImport, importActor, listImports } from './_service';

export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request) => jsonResponse(await listImports(await importActor(request))));
export const POST = apiRoute(async (request: Request) => jsonResponse(await createImport(request, await importActor(request, true)), 201));
