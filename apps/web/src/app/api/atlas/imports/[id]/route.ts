import { apiRoute, jsonResponse } from '@/lib/server/http';
import { getImportReview, importActor, updateImport } from '../_service';

type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request, context: Context) => jsonResponse(await getImportReview(await importActor(request), (await context.params).id)));
export const PATCH = apiRoute(async (request: Request, context: Context) => jsonResponse(await updateImport(request, await importActor(request, true), (await context.params).id)));
