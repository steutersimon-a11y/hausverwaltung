import 'server-only';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, auditEvents, properties, tasks } from '@atlas/db';
import { ApiError } from './http';
import { type Actor, propertyScope, requireProperty, requireUnit } from './security';
import { taskDto } from './portfolio';

const taskFields = {
  title: z.string().trim().min(1).max(180),
  description: z.string().max(10_000),
  status: z.enum(['open', 'in_progress', 'done']),
  priority: z.enum(['low', 'normal', 'high']),
  dueDate: z.iso.date().nullable(),
};
export const taskQuerySchema = z.object({ propertyId: z.uuid().optional(), unitId: z.uuid().optional() }).strict();
export const createTaskSchema = z.object({ propertyId: z.uuid(), unitId: z.uuid().optional(), title: taskFields.title,
  description: taskFields.description.default(''), priority: taskFields.priority.default('normal'), dueDate: taskFields.dueDate.optional() }).strict();
export const updateTaskSchema = z.object({ revision: z.number().int().positive(), title: taskFields.title.optional(), description: taskFields.description.optional(),
  status: taskFields.status.optional(), priority: taskFields.priority.optional(), dueDate: taskFields.dueDate.optional() }).strict().refine(v => Object.keys(v).length > 1, { message: 'Bitte mindestens ein Feld ändern.' });

export async function listTasks(actor: Actor, query: z.infer<typeof taskQuerySchema>) {
  if (query.propertyId) await requireProperty(actor, query.propertyId);
  if (query.unitId) {
    const { unit } = await requireUnit(actor, query.unitId);
    if (query.propertyId && unit.propertyId !== query.propertyId) throw new ApiError('NOT_FOUND', 404, 'Einheit nicht gefunden.');
  }
  const rows = await db.select({ task: tasks }).from(tasks)
    .innerJoin(properties, and(eq(properties.id, tasks.propertyId), eq(properties.organizationId, tasks.organizationId)))
    .where(and(propertyScope(actor), eq(tasks.organizationId, actor.organizationId), query.propertyId ? eq(tasks.propertyId, query.propertyId) : undefined, query.unitId ? eq(tasks.unitId, query.unitId) : undefined))
    .orderBy(asc(tasks.dueDate), desc(tasks.createdAt)).limit(500);
  return { tasks: rows.map(row => taskDto(row.task)) };
}

export async function createTask(actor: Actor, input: z.infer<typeof createTaskSchema>) {
  await requireProperty(actor, input.propertyId, true);
  if (input.unitId) {
    const { unit } = await requireUnit(actor, input.unitId, true);
    if (unit.propertyId !== input.propertyId) throw new ApiError('INVALID_HIERARCHY', 422, 'Die Einheit gehört nicht zum gewählten Objekt.');
  }
  return db.transaction(async tx => {
    const [created] = await tx.insert(tasks).values({ ...input, organizationId: actor.organizationId, createdBy: actor.user.id, dueDate: input.dueDate ?? null }).returning();
    if (!created) throw new Error('Task insert did not return a row');
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: input.propertyId, actorId: actor.user.id, entityType: 'task', entityId: created.id,
      action: 'task.created', before: null, after: { ...taskDto(created) } });
    return { task: taskDto(created) };
  });
}

export async function updateTask(actor: Actor, id: string, input: z.infer<typeof updateTaskSchema>) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.organizationId, actor.organizationId), eq(tasks.id, id))).limit(1);
  if (!task) throw new ApiError('NOT_FOUND', 404, 'Aufgabe nicht gefunden.');
  await requireProperty(actor, task.propertyId, true);
  const { revision, ...changes } = input;
  return db.transaction(async tx => {
    const [updated] = await tx.update(tasks).set({ ...changes, revision: revision + 1, updatedAt: new Date() })
      .where(and(eq(tasks.organizationId, actor.organizationId), eq(tasks.propertyId, task.propertyId), eq(tasks.id, id), eq(tasks.revision, revision))).returning();
    if (!updated) throw new ApiError('REVISION_CONFLICT', 409, 'Die Aufgabe wurde inzwischen geändert. Bitte lade sie neu.');
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, propertyId: task.propertyId, actorId: actor.user.id, entityType: 'task', entityId: id,
      action: 'task.updated', before: { ...taskDto(task) }, after: { ...taskDto(updated) } });
    return { task: taskDto(updated) };
  });
}
