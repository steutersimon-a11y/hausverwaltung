import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentDto, PortfolioResponse, PropertyResponse, TaskDto, UnitDto, UnitResponse } from '../../packages/db/src/contracts';
import { createHarness, fileUpload, ids, json, pngV1, pngV2, syntheticProperties, unitInput, type Harness } from './support';

let app: Harness;
beforeEach(async () => { app = await createHarness(); await app.bootstrap(); });
afterEach(async () => { await app?.dispose(); });

async function createUnit(code?: string): Promise<UnitDto> {
  const response = await app.api('/api/atlas/units', { method: 'POST', json: unitInput(code) });
  expect(response.status).toBe(201);
  return (await json<{ unit: UnitDto }>(response)).unit;
}

describe('hosted private workspace with real D1/R2 persistence', () => {
  it('preserves unknown source fields and does not fabricate unit records from reported counts', async () => {
    const response = await app.api('/api/atlas/portfolio');
    expect(response.status).toBe(200);
    const portfolio = await json<PortfolioResponse & { properties: Array<PortfolioResponse['properties'][number] & { reportedTotalUnits: number | null }> }>(response);
    expect(portfolio.properties).toHaveLength(2);
    const known = portfolio.properties.find(property => property.id === ids.property);
    const unknown = portfolio.properties.find(property => property.id === ids.otherProperty);
    expect(known).toMatchObject({ reportedTotalUnits: 6, unitCount: 0 });
    expect(unknown).toMatchObject({ managementType: null, reportedTotalUnits: null, latitude: null, longitude: null, street: null });
    const detail = await json<PropertyResponse>(await app.api(`/api/atlas/properties/${ids.property}`));
    expect(detail.buildings.flatMap(building => building.floors.flatMap(floor => floor.units))).toHaveLength(0);
    const repeated = await app.api('/api/atlas/bootstrap', { method: 'POST', actor: 'service', json: { properties: syntheticProperties() } });
    expect([200, 409]).toContain(repeated.status);
    const reread = await json<PortfolioResponse>(await app.api('/api/atlas/portfolio'));
    expect(reread.properties).toHaveLength(2);
  });

  it('persists units, rejects a racing stale edit and archives without deleting audit or original plans', async () => {
    const created = await createUnit();
    const route = `/api/atlas/units/${created.id}`;
    expect(created).toMatchObject({ propertyId: ids.property, buildingId: ids.building, floorId: ids.floor, revision: 1, areaM2: 61.25, rooms: 2.5 });
    const duplicate = await app.api('/api/atlas/units', { method: 'POST', json: unitInput() });
    expect(duplicate.status).toBe(409);
    const upload = await app.api('/api/atlas/documents', { method: 'POST', body: fileUpload(pngV1, { propertyId: ids.property, unitId: created.id, kind: 'floorplan', title: 'Fiktiver historischer Plan' }) });
    expect(upload.status).toBe(201);
    const document = (await json<{ document: DocumentDto }>(upload)).document;

    const edits = await Promise.all([
      app.api(route, { method: 'PATCH', json: { revision: 1, note: 'Fiktive Änderung A' } }),
      app.api(route, { method: 'PATCH', json: { revision: 1, note: 'Fiktive Änderung B' } }),
    ]);
    expect(edits.map(response => response.status).sort()).toEqual([200, 409]);
    const reloaded = await json<UnitResponse>(await app.api(route));
    expect(reloaded.unit.revision).toBe(2);
    expect(reloaded.unit).toMatchObject({ areaM2: 61.25, rooms: 2.5, status: 'vacant' });
    expect(['Fiktive Änderung A', 'Fiktive Änderung B']).toContain(reloaded.unit.note);
    const updates = reloaded.audit.filter(event => event.action === 'unit.updated');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.before).toMatchObject({ note: unitInput().note, revision: 1 });
    expect(updates[0]?.after).toMatchObject({ note: reloaded.unit.note, revision: 2 });

    expect((await app.api(route, { method: 'DELETE', json: { revision: 1 } })).status).toBe(409);
    expect((await app.api(route, { method: 'DELETE', json: { revision: 2 } })).status).toBe(200);
    expect((await app.api(route)).status).toBe(404);
    const property = await json<PropertyResponse>(await app.api(`/api/atlas/properties/${ids.property}`));
    expect(property.buildings.flatMap(building => building.floors.flatMap(floor => floor.units.map(unit => unit.id)))).not.toContain(created.id);
    expect(property.audit.filter(event => event.entityId === created.id).map(event => event.action)).toEqual(expect.arrayContaining(['unit.created', 'unit.updated', 'unit.archived']));
    const original = await app.api(document.downloadUrl);
    expect(original.status).toBe(200);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(pngV1);
  });

  it('allows explicitly unassigned units without claiming a measured building or floor', async () => {
    const response = await app.api('/api/atlas/units', { method: 'POST', json: { ...unitInput('UNASSIGNED-TEST'), propertyId: ids.otherProperty, buildingId: null, floorId: null, areaM2: null, rooms: null } });
    expect(response.status).toBe(201);
    const unit = (await json<{ unit: UnitDto }>(response)).unit;
    const detail = await json<UnitResponse>(await app.api(`/api/atlas/units/${unit.id}`));
    expect(detail.unit.areaM2).toBeNull();
    expect(detail.unit.rooms).toBeNull();
    const property = await json<PropertyResponse>(await app.api(`/api/atlas/properties/${ids.otherProperty}`));
    const unassigned = property.buildings.find(building => building.id === `unassigned-building:${ids.otherProperty}`);
    expect(unassigned?.name).toMatch(/offen|zugeordnet/i);
    expect(unassigned?.footprint).toBeNull();
    expect(unassigned?.floors.flatMap(floor => floor.units.map(item => item.id))).toContain(unit.id);
    const stored = await app.database.prepare('SELECT data FROM app_state').first<{ data: string }>();
    const state = JSON.parse(stored!.data) as { properties: Array<{ id: string; buildings: unknown[] }>; units: Array<{ id: string; buildingId: string | null; floorId: string | null }> };
    expect(state.properties.find(item => item.id === ids.otherProperty)?.buildings).toHaveLength(1);
    expect(state.units.find(item => item.id === unit.id)).toMatchObject({ buildingId: null, floorId: null });
  });

  it('persists task status transitions with revisions and before/after history', async () => {
    const unit = await createUnit();
    const response = await app.api('/api/atlas/tasks', { method: 'POST', json: { propertyId: ids.property, unitId: unit.id, title: 'Fiktive Wartungsprüfung', description: 'Keine reale Beauftragung.', priority: 'high', dueDate: '2026-12-15' } });
    expect(response.status).toBe(201);
    const created = (await json<{ task: TaskDto }>(response)).task;
    expect(created).toMatchObject({ status: 'open', revision: 1 });
    const route = `/api/atlas/tasks/${created.id}`;
    const started = await json<{ task: TaskDto }>(await app.api(route, { method: 'PATCH', json: { revision: 1, status: 'in_progress' } }));
    expect(started.task).toMatchObject({ status: 'in_progress', revision: 2 });
    expect((await app.api(route, { method: 'PATCH', json: { revision: 1, status: 'done' } })).status).toBe(409);
    const finished = await app.api(route, { method: 'PATCH', json: { revision: 2, status: 'done' } });
    expect(finished.status).toBe(200);
    const tasks = await json<{ tasks: TaskDto[] }>(await app.api(`/api/atlas/tasks?propertyId=${ids.property}&unitId=${unit.id}`));
    expect(tasks.tasks.find(task => task.id === created.id)).toMatchObject({ title: 'Fiktive Wartungsprüfung', status: 'done', revision: 3, dueDate: '2026-12-15', description: 'Keine reale Beauftragung.', priority: 'high' });
    const property = await json<PropertyResponse>(await app.api(`/api/atlas/properties/${ids.property}`));
    const changes = property.audit.filter(event => event.entityId === created.id && event.action === 'task.updated');
    expect(changes).toHaveLength(2);
    expect(changes.some(event => (event.before as { status?: string } | null)?.status === 'open' && (event.after as { status?: string } | null)?.status === 'in_progress')).toBe(true);
    expect(changes.some(event => (event.before as { status?: string } | null)?.status === 'in_progress' && (event.after as { status?: string } | null)?.status === 'done')).toBe(true);
  });

  it('keeps every uploaded version byte-identical and refuses a stale version append', async () => {
    const unit = await createUnit();
    const upload = await app.api('/api/atlas/documents', { method: 'POST', body: fileUpload(pngV1, { propertyId: ids.property, unitId: unit.id, kind: 'floorplan', title: 'Fiktiver Versionsplan' }) });
    expect(upload.status).toBe(201);
    const created = (await json<{ document: DocumentDto }>(upload)).document;
    const versionRoute = `/api/atlas/documents/${created.id}/versions`;
    const version = await app.api(versionRoute, { method: 'POST', body: fileUpload(pngV2, { expectedVersion: '1' }, 'fiktiver-testplan-v2.png') });
    expect(version.status).toBe(201);
    expect((await json<{ document: DocumentDto }>(version)).document).toMatchObject({ id: created.id, version: 2, propertyId: ids.property, unitId: unit.id });
    expect((await app.api(versionRoute, { method: 'POST', body: fileUpload(pngV1, { expectedVersion: '1' }) })).status).toBe(409);
    const contentRoute = `/api/atlas/documents/${created.id}/content`;
    const original = await app.api(`${contentRoute}?version=1`);
    expect(original.status).toBe(200);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(pngV1);
    const latest = await app.api(contentRoute);
    expect(latest.status).toBe(200);
    expect(new Uint8Array(await latest.arrayBuffer())).toEqual(pngV2);
    expect((await app.api(`${contentRoute}?version=3`)).status).toBe(404);
    const listed = await json<{ documents: DocumentDto[] }>(await app.api(`/api/atlas/documents?propertyId=${ids.property}`));
    expect(listed.documents.find(document => document.id === created.id)?.version).toBe(2);
    expect(JSON.stringify(listed)).not.toContain('storageKey');
  });

  it('persists tenant details and protects concurrent edits with an audit trail', async () => {
    const unit = await createUnit();
    const response = await app.api(`/api/atlas/units/${unit.id}/parties`, { method: 'POST', json: { name: 'Ausdrücklich fiktive Mietpartei', role: 'tenant' } });
    expect(response.status).toBe(201);
    const created = (await json<{ party: { id: string; name: string; role: string; revision: number } }>(response)).party;
    expect(created).toMatchObject({ name: 'Ausdrücklich fiktive Mietpartei', role: 'tenant', revision: 1 });
    const route = `/api/atlas/parties/${created.id}`;
    const update = await app.api(route, { method: 'PATCH', json: { revision: 1, name: 'Fiktive Mietpartei – geändert' } });
    expect(update.status).toBe(200);
    expect((await app.api(route, { method: 'PATCH', json: { revision: 1, name: 'Nicht übernehmen' } })).status).toBe(409);
    const detail = await json<UnitResponse>(await app.api(`/api/atlas/units/${unit.id}`));
    expect(detail.parties.find(party => party.id === created.id)).toMatchObject({ name: 'Fiktive Mietpartei – geändert', role: 'tenant' });
    const history = detail.audit.filter(event => event.entityId === created.id);
    expect(history.some(event => event.action === 'party.created')).toBe(true);
    expect(history.some(event => event.action === 'party.updated' && (event.before as { name?: string } | null)?.name === 'Ausdrücklich fiktive Mietpartei')).toBe(true);
  });

  it('persists a validated synthetic 3D mesh and advertises it only for its assigned property', async () => {
    const mesh = {
      origin: [0, 0], source: 'Ausdrücklich fiktive Testgeometrie', license: 'Synthetic test fixture',
      buildings: [{ objekt_id: ids.property, vertices: [[0, 0, 0], [2, 0, 0], [0, 0, 2]], surfaces: [{ kind: 'WallSurface', rings: [[0, 1, 2]] }] }],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(mesh));
    const route = `/api/atlas/models/${ids.property}`;
    const upload = await app.api(route, { method: 'POST', body: fileUpload(bytes, {}, 'fiktives-testmodell.json', 'application/json') });
    expect(upload.status).toBe(201);
    const model = (await json<{ model: { propertyId: string; version: number; downloadUrl: string } }>(upload)).model;
    expect(model).toMatchObject({ propertyId: ids.property, version: 1 });
    const read = await app.api(model.downloadUrl);
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
    const portfolio = await json<{ properties: Array<{ id: string; modelUrl: string | null }> }>(await app.api('/api/atlas/portfolio'));
    expect(portfolio.properties.find(property => property.id === ids.property)?.modelUrl).toBe(model.downloadUrl);
    expect(portfolio.properties.find(property => property.id === ids.otherProperty)?.modelUrl).toBeNull();
    expect((await app.api(model.downloadUrl, { actor: 'anonymous' })).status).toBe(401);
    const invalid = { ...mesh, buildings: [{ ...mesh.buildings[0], surfaces: [{ kind: 'WallSurface', rings: [[0, 1, 99]] }] }] };
    const bad = await app.api(route, { method: 'POST', body: fileUpload(new TextEncoder().encode(JSON.stringify(invalid)), { expectedVersion: '1' }, 'invalides-testmodell.json', 'application/json') });
    expect(bad.status).toBe(422);
    const unchanged = await app.api(model.downloadUrl);
    expect(new Uint8Array(await unchanged.arrayBuffer())).toEqual(bytes);

    const revisedMesh = { ...mesh, source: 'Ausdrücklich fiktive zweite Testgeometrie', buildings: [{ ...mesh.buildings[0], vertices: [[0, 0, 0], [3, 0, 0], [0, 0, 3]] }] };
    const revisedBytes = new TextEncoder().encode(JSON.stringify(revisedMesh));
    const nextUpload = await app.api(route, { method: 'POST', body: fileUpload(revisedBytes, { expectedVersion: '1' }, 'fiktives-testmodell-v2.json', 'application/json') });
    expect(nextUpload.status).toBe(201);
    const nextModel = (await json<{ model: { propertyId: string; version: number; downloadUrl: string } }>(nextUpload)).model;
    expect(nextModel.version).toBe(2);
    expect(nextModel.downloadUrl).not.toBe(model.downloadUrl);
    expect(nextModel.downloadUrl).toContain('version=2');
    const oldVersion = await app.api(model.downloadUrl);
    expect(new Uint8Array(await oldVersion.arrayBuffer())).toEqual(bytes);
    const currentVersion = await app.api(nextModel.downloadUrl);
    expect(new Uint8Array(await currentVersion.arrayBuffer())).toEqual(revisedBytes);
    expect((await app.api(route, { method: 'POST', body: fileUpload(bytes, { expectedVersion: '1' }, 'veraltetes-testmodell.json', 'application/json') })).status).toBe(409);
    const updatedPortfolio = await json<{ properties: Array<{ id: string; modelUrl: string | null }> }>(await app.api('/api/atlas/portfolio'));
    expect(updatedPortfolio.properties.find(property => property.id === ids.property)?.modelUrl).toBe(nextModel.downloadUrl);
  });
});
