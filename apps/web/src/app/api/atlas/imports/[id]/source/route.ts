import { db, auditEvents } from '@atlas/db';
import { apiRoute } from '@/lib/server/http';
import { getPrivateFile } from '@/lib/server/storage';
import { importActor, loadBatch } from '../../_service';

type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
export const GET = apiRoute(async (request: Request, context: Context) => {
  const actor = await importActor(request);
  const batch = await loadBatch(actor, (await context.params).id);
  const bytes = await getPrivateFile(batch.storageKey);
  await db.insert(auditEvents).values({ organizationId: actor.organizationId, actorId: actor.user.id, action: 'import.source_read', entityType: 'import_batch', entityId: batch.id });
  const disposition = batch.format === 'screenshot' ? 'inline' : 'attachment';
  return new Response(Buffer.from(bytes), { headers: {
    'Content-Type': batch.mimeType, 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'private, no-store',
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(batch.originalName)}`,
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
});
