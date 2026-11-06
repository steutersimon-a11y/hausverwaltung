import { ApiError } from './http';
import type { Actor, AppState, Env } from './types';

export const blankState = (): AppState => ({ schemaVersion: 1, organization: { id: 'neuhaus-private-workspace', name: 'Neuhaus Immobilien' }, properties: [], units: [], parties: [], tasks: [], documents: [], models: [], audit: [], imports: [] });
export async function loadState(env: Env): Promise<{ state: AppState; revision: number }> {
  let row = await env.DB.prepare('SELECT revision, data FROM app_state WHERE key = ?').bind('main').first<{ revision: number; data: string }>();
  if (!row) {
    await env.DB.prepare('INSERT OR IGNORE INTO app_state (key, revision, data) VALUES (?, ?, ?)').bind('main', 0, JSON.stringify(blankState())).run();
    row = await env.DB.prepare('SELECT revision, data FROM app_state WHERE key = ?').bind('main').first<{ revision: number; data: string }>();
  }
  if (!row) throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Der Anwendungsspeicher ist momentan nicht verfügbar.');
  const state = JSON.parse(row.data) as AppState;
  if (state.schemaVersion !== 1) throw new ApiError('STATE_VERSION', 503, 'Der gespeicherte Datenstand benötigt eine Migration.');
  return { state, revision: row.revision };
}
export async function updateState<T>(env: Env, mutator: (state: AppState) => T | Promise<T>): Promise<T> {
  const { state, revision } = await loadState(env);
  const result = await mutator(state);
  const encoded = JSON.stringify(state);
  if(new TextEncoder().encode(encoded).byteLength > 1_900_000) throw new ApiError('STATE_SIZE',413,'Der geschützte Arbeitsbereich ist voll. Bitte vor weiteren Importen den Speicher erweitern.');
  const saved = await env.DB.prepare('UPDATE app_state SET data = ?, revision = ? WHERE key = ? AND revision = ?').bind(encoded, revision + 1, 'main', revision).run();
  if (saved.meta.changes !== 1) throw new ApiError('REVISION_CONFLICT', 409, 'Die Daten wurden zwischenzeitlich geändert. Bitte aktualisieren und erneut speichern.');
  return result;
}
export function appendAudit(state: AppState, actor: Actor, action: string, entityType: string, entityId: string, before: unknown, after: unknown, propertyId: string | null = null, unitId: string | null = null): void {
  state.audit.push({ id: crypto.randomUUID(), action, entityType, entityId, before: structuredClone(before), after: structuredClone(after), actorId: actor.id, actorName: actor.name, propertyId, unitId, createdAt: new Date().toISOString() });
}
