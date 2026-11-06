import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, memberships, organizations, properties, propertyGrants, sqlClient, units } from '@atlas/db';
import type { Role } from '@atlas/db/contracts';
import { auth } from './auth';
import { ApiError, idSchema } from './http';

export interface Actor {
  user: { id: string; name: string; email: string };
  organizationId: string;
  organizationName: string;
  role: Role;
  grants: Map<string, { canEdit: boolean }>;
}

export async function requireActor(request: Request): Promise<Actor> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new ApiError('UNAUTHENTICATED', 401, 'Bitte melde dich an.');
  const requestedOrg = request.headers.get('x-organization-id');
  if (requestedOrg && !idSchema.safeParse(requestedOrg).success) throw new ApiError('ORGANIZATION', 403, 'Keine Berechtigung für diese Organisation.');
  const rows = await db.select({ membership: memberships, organization: organizations }).from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, session.user.id), requestedOrg ? eq(memberships.organizationId, requestedOrg) : undefined))
    .orderBy(memberships.organizationId).limit(1);
  const row = rows[0];
  if (!row) throw new ApiError('ORGANIZATION', 403, 'Keine Berechtigung für diese Organisation.');
  const grants = await db.select({ propertyId: propertyGrants.propertyId, canEdit: propertyGrants.canEdit }).from(propertyGrants)
    .where(and(eq(propertyGrants.organizationId, row.organization.id), eq(propertyGrants.userId, session.user.id)));
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    organizationId: row.organization.id, organizationName: row.organization.name,
    role: row.membership.role, grants: new Map(grants.map(g => [g.propertyId, { canEdit: g.canEdit }])),
  };
}

export function propertyScope(actor: Actor) {
  const broad = actor.role === 'admin' || actor.role === 'manager';
  return and(eq(properties.organizationId, actor.organizationId), isNull(properties.archivedAt), broad ? undefined : actor.grants.size ? inArray(properties.id, [...actor.grants.keys()]) : sql`false`);
}

export async function requireProperty(actor: Actor, id: string, write = false) {
  if (!idSchema.safeParse(id).success) throw new ApiError('NOT_FOUND', 404, 'Objekt nicht gefunden.');
  const [property] = await db.select().from(properties).where(and(propertyScope(actor), eq(properties.id, id))).limit(1);
  if (!property) throw new ApiError('NOT_FOUND', 404, 'Objekt nicht gefunden.');
  if (write && (actor.role === 'viewer' || (actor.role === 'editor' && !actor.grants.get(id)?.canEdit))) {
    throw new ApiError('FORBIDDEN', 403, 'Für dieses Objekt hast du nur Leserechte.');
  }
  return property;
}

export async function requireUnit(actor: Actor, id: string, write = false) {
  if (!idSchema.safeParse(id).success) throw new ApiError('NOT_FOUND', 404, 'Einheit nicht gefunden.');
  const [unit] = await db.select().from(units).where(and(eq(units.organizationId, actor.organizationId), eq(units.id, id), isNull(units.archivedAt))).limit(1);
  if (!unit) throw new ApiError('NOT_FOUND', 404, 'Einheit nicht gefunden.');
  const property = await requireProperty(actor, unit.propertyId, write);
  return { unit, property };
}

export function assertMutationOrigin(request: Request): void {
  const expected = new URL(process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin;
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError('CSRF', 403, 'Die Anfrage stammt nicht aus der Anwendung. Bitte lade die Seite neu.');
  }
}

/** Persistent fixed-window limit, shared by every server instance using this DB. */
export async function enforceWriteRateLimit(actor: Actor): Promise<void> {
  const window = Math.floor(Date.now() / 60_000);
  const key = `${actor.organizationId}:${actor.user.id}:write`;
  const rows = await sqlClient<{ count: number }[]>`
    INSERT INTO request_rate_limits (key,window_start,count) VALUES (${key},${window},1)
    ON CONFLICT (key,window_start) DO UPDATE SET count=request_rate_limits.count+1 RETURNING count`;
  if ((rows[0]?.count ?? 0) > 60) throw new ApiError('RATE_LIMIT', 429, 'Zu viele Änderungen. Bitte versuche es in einer Minute erneut.');
  if (rows[0]?.count === 1) await sqlClient`DELETE FROM request_rate_limits WHERE window_start < ${window - 1440}`;
}
