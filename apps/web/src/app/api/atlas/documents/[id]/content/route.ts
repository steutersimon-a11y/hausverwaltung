import { z } from 'zod';
import { apiRoute, idSchema } from '@/lib/server/http';
import { requireActor } from '@/lib/server/security';
import { downloadDocument } from '@/lib/server/documents';

export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(request);
  const id = idSchema.parse((await context.params).id);
  const rawVersion = new URL(request.url).searchParams.get('version');
  const version = rawVersion ? z.coerce.number().int().positive().parse(rawVersion) : undefined;
  const result = await downloadDocument(actor, id, version);
  return new Response(Buffer.from(result.bytes), { headers: {
    'Content-Type': result.version.mimeType,
    'Content-Length': String(result.bytes.byteLength),
    'Content-Disposition': `inline; filename="document"; filename*=UTF-8''${encodeURIComponent(result.version.originalName)}`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'self'",
  } });
});
