import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import type { PortfolioResponse, PropertyResponse, TaskDto, UnitDto, UnitResponse, DocumentDto } from '../../packages/db/src/contracts';
import { login, origin } from './support';

async function fixture(request: APIRequestContext, code = 'DEMO-001') {
  const response = await request.get('/api/atlas/portfolio');
  expect(response.ok()).toBeTruthy();
  const portfolio = await response.json() as PortfolioResponse;
  const summary = portfolio.properties.find(property => property.code === code);
  if (!summary) throw new Error(`Synthetic fixture ${code} is missing`);
  const detailResponse = await request.get(`/api/atlas/properties/${summary.id}`);
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json() as PropertyResponse;
  const building = detail.buildings[0], floor = building?.floors[0], unit = floor?.units[0];
  if (!building || !floor || !unit) throw new Error(`Synthetic fixture ${code} has no complete hierarchy`);
  return { property: detail.property, building, floor, unit };
}

test('a synthetic unit can be created, persisted and archived without erasing history', async ({ request }) => {
  await login(request);
  const { property, building, floor } = await fixture(request);
  const input = {
    propertyId: property.id, buildingId: building.id, floorId: floor.id,
    code: `E2E-${randomUUID().slice(0, 12)}`,
    label: 'Ausdrücklich fiktive Lifecycle-Testeinheit',
    usage: 'residential', status: 'vacant', areaM2: 57.25, rooms: 2.5,
    note: 'Synthetischer HTTP-Test. Keine reale Wohnung und keine echte Person.',
  };
  const create = await request.post('/api/atlas/units', { headers: { origin }, data: input });
  expect(create.status()).toBe(201);
  const { unit: created } = await create.json() as { unit: UnitDto };
  expect(created.propertyId).toBe(property.id);
  expect(created.buildingId).toBe(building.id);
  expect(created.floorId).toBe(floor.id);
  expect(created.areaM2).toBe(57.25);
  expect(created.revision).toBe(1);

  const url = `/api/atlas/units/${created.id}`;
  const reloaded = await (await request.get(url)).json() as UnitResponse;
  expect(reloaded.unit.label).toBe(input.label);
  expect(reloaded.unit.rooms).toBe(2.5);
  expect(reloaded.audit.some(event => event.action === 'unit.created')).toBeTruthy();

  const duplicate = await request.post('/api/atlas/units', { headers: { origin }, data: input });
  expect(duplicate.status()).toBe(409);

  const upload = await request.post('/api/atlas/documents', { headers: { origin }, multipart: {
    propertyId: property.id, unitId: created.id, kind: 'floorplan',
    file: { name: 'fiktiver-historischer-grundriss.png', mimeType: 'image/png', buffer: pngV1 },
  } });
  expect(upload.status()).toBe(201);
  const { document: historicalDocument } = await upload.json() as { document: DocumentDto };

  const update = await request.patch(url, { headers: { origin }, data: { revision: created.revision, note: 'Synthetisch geändert; bleibt in der Historie.' } });
  expect(update.status()).toBe(200);
  const { unit: changed } = await update.json() as { unit: UnitDto };
  expect(changed.revision).toBe(2);
  const staleArchive = await request.delete(url, { headers: { origin }, data: { revision: created.revision } });
  expect(staleArchive.status()).toBe(409);
  expect((await request.get(url)).status()).toBe(200);

  const archive = await request.delete(url, { headers: { origin }, data: { revision: changed.revision } });
  expect(archive.status()).toBe(200);
  expect(await archive.json()).toMatchObject({ archived: true, id: created.id, revision: 3 });
  expect((await request.get(url)).status()).toBe(404);
  expect((await request.delete(url, { headers: { origin }, data: { revision: changed.revision } })).status()).toBe(404);
  expect((await request.patch(url, { headers: { origin }, data: { revision: changed.revision, note: 'Nicht übernehmen.' } })).status()).toBe(404);

  const detail = await (await request.get(`/api/atlas/properties/${property.id}`)).json() as PropertyResponse;
  const activeUnitIds = detail.buildings.flatMap(item => item.floors.flatMap(level => level.units.map(unit => unit.id)));
  expect(activeUnitIds).not.toContain(created.id);
  const history = detail.audit.filter(event => event.entityId === created.id);
  expect(history.map(event => event.action)).toEqual(expect.arrayContaining(['unit.created', 'unit.updated', 'unit.archived']));
  expect(history.find(event => event.action === 'unit.updated')?.before).toMatchObject({ note: input.note, revision: 1 });
  const propertyDocuments = await (await request.get(`/api/atlas/documents?propertyId=${property.id}`)).json() as { documents: DocumentDto[] };
  expect(propertyDocuments.documents.some(document => document.id === historicalDocument.id)).toBeTruthy();
  const preserved = await request.get(historicalDocument.downloadUrl);
  expect(preserved.status()).toBe(200);
  expect(await preserved.body()).toEqual(pngV1);

  await login(request, 'readonly@atlas.example');
  const forbidden = await request.post('/api/atlas/units', { headers: { origin }, data: { ...input, code: `E2E-DENY-${randomUUID().slice(0, 8)}` } });
  expect(forbidden.status()).toBe(403);
});

test('task lifecycle is persisted and audited while read-only and foreign actors cannot mutate it', async ({ request }) => {
  await login(request);
  const { property, unit } = await fixture(request);
  const title = `Fiktive Lifecycle-Aufgabe ${randomUUID().slice(0, 8)}`;
  const create = await request.post('/api/atlas/tasks', { headers: { origin }, data: {
    propertyId: property.id, unitId: unit.id, title,
    description: 'Ausdrücklich synthetische Testaufgabe ohne reale Beauftragung.', priority: 'normal', dueDate: '2026-12-15',
  } });
  expect(create.status()).toBe(201);
  const { task: created } = await create.json() as { task: TaskDto };
  expect(created.status).toBe('open');
  expect(created.revision).toBe(1);
  expect(created.unitId).toBe(unit.id);
  const url = `/api/atlas/tasks/${created.id}`;

  const start = await request.patch(url, { headers: { origin }, data: { revision: created.revision, status: 'in_progress' } });
  expect(start.status()).toBe(200);
  const { task: inProgress } = await start.json() as { task: TaskDto };
  expect(inProgress.status).toBe('in_progress');
  expect(inProgress.revision).toBe(2);
  const stale = await request.patch(url, { headers: { origin }, data: { revision: created.revision, status: 'done' } });
  expect(stale.status()).toBe(409);

  const finish = await request.patch(url, { headers: { origin }, data: { revision: inProgress.revision, status: 'done' } });
  expect(finish.status()).toBe(200);
  const { task: done } = await finish.json() as { task: TaskDto };
  expect(done.status).toBe('done');
  expect(done.revision).toBe(3);
  const refreshed = await (await request.get(`/api/atlas/tasks?propertyId=${property.id}&unitId=${unit.id}`)).json() as { tasks: TaskDto[] };
  expect(refreshed.tasks.find(task => task.id === created.id)).toMatchObject({ title, status: 'done', revision: 3, dueDate: '2026-12-15' });

  const detail = await (await request.get(`/api/atlas/properties/${property.id}`)).json() as PropertyResponse;
  const history = detail.audit.filter(event => event.entityId === created.id);
  expect(history.filter(event => event.action === 'task.updated')).toHaveLength(2);
  expect(history.some(event => event.action === 'task.created')).toBeTruthy();
  expect(history.some(event => (event.before as { status?: string } | null)?.status === 'open' && (event.after as { status?: string } | null)?.status === 'in_progress')).toBeTruthy();
  expect(history.some(event => (event.before as { status?: string } | null)?.status === 'in_progress' && (event.after as { status?: string } | null)?.status === 'done')).toBeTruthy();

  await login(request, 'readonly@atlas.example');
  expect((await request.patch(url, { headers: { origin }, data: { revision: done.revision, status: 'open' } })).status()).toBe(403);
  expect((await request.post('/api/atlas/tasks', { headers: { origin }, data: { propertyId: property.id, title: 'Nicht anzulegende fiktive Aufgabe' } })).status()).toBe(403);

  await login(request, 'extern@atlas.example');
  expect((await request.get(`/api/atlas/tasks?propertyId=${property.id}`)).status()).toBe(404);
  expect((await request.patch(url, { headers: { origin }, data: { revision: done.revision, status: 'open' } })).status()).toBe(404);
});

// Small generated PNGs, no actual building/plan/person content.
const pngV1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6f3cAAAAASUVORK5CYII=', 'base64');
const pngV2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFUlEQVR4nGN8/uouAwMDEwMDA4ICADNIArT7sdOCAAAAAElFTkSuQmCC', 'base64');

test('document versions preserve original bytes and property/unit assignment', async ({ request }) => {
  await login(request);
  const { property, unit } = await fixture(request);
  const other = await fixture(request, 'DEMO-002');
  const mismatched = await request.post('/api/atlas/documents', { headers: { origin }, multipart: {
    propertyId: property.id, unitId: other.unit.id, kind: 'floorplan',
    file: { name: 'fiktiver-falsch-zugeordneter-plan.png', mimeType: 'image/png', buffer: pngV1 },
  } });
  expect(mismatched.status()).toBe(422);

  const create = await request.post('/api/atlas/documents', { headers: { origin }, multipart: {
    propertyId: property.id, unitId: unit.id, kind: 'floorplan',
    file: { name: 'fiktiver-versionstest-v1.png', mimeType: 'image/png', buffer: pngV1 },
  } });
  expect(create.status()).toBe(201);
  const { document: created } = await create.json() as { document: DocumentDto };
  expect(created).toMatchObject({ propertyId: property.id, unitId: unit.id, version: 1 });

  const versionUrl = `/api/atlas/documents/${created.id}/versions`;
  const nextVersion = await request.post(versionUrl, { headers: { origin }, multipart: {
    expectedVersion: '1', file: { name: 'fiktiver-versionstest-v2.png', mimeType: 'image/png', buffer: pngV2 },
  } });
  expect(nextVersion.status()).toBe(201);
  const { document: changed } = await nextVersion.json() as { document: DocumentDto };
  expect(changed).toMatchObject({ id: created.id, propertyId: property.id, unitId: unit.id, version: 2 });

  const stale = await request.post(versionUrl, { headers: { origin }, multipart: {
    expectedVersion: '1', file: { name: 'nicht-zu-uebernehmende-fiktive-version.png', mimeType: 'image/png', buffer: pngV1 },
  } });
  expect(stale.status()).toBe(409);
  const content = `/api/atlas/documents/${created.id}/content`;
  const original = await request.get(`${content}?version=1`);
  expect(original.status()).toBe(200);
  expect(await original.body()).toEqual(pngV1);
  const latest = await request.get(content);
  expect(latest.status()).toBe(200);
  expect(await latest.body()).toEqual(pngV2);
  expect((await request.get(`${content}?version=3`)).status()).toBe(404);
  const list = await (await request.get(`/api/atlas/documents?propertyId=${property.id}&unitId=${unit.id}`)).json() as { documents: DocumentDto[] };
  expect(list.documents.find(document => document.id === created.id)?.version).toBe(2);
  const otherList = await (await request.get(`/api/atlas/documents?propertyId=${other.property.id}&unitId=${other.unit.id}`)).json() as { documents: DocumentDto[] };
  expect(otherList.documents.some(document => document.id === created.id)).toBeFalsy();

  await login(request, 'readonly@atlas.example');
  expect((await request.post(versionUrl, { headers: { origin }, multipart: {
    expectedVersion: '2', file: { name: 'verbotene-fiktive-version.png', mimeType: 'image/png', buffer: pngV1 },
  } })).status()).toBe(403);

  await login(request, 'extern@atlas.example');
  expect((await request.get(`${content}?version=1`)).status()).toBe(404);
  expect((await request.get(`${content}?version=2`)).status()).toBe(404);
  expect((await request.post(versionUrl, { headers: { origin }, multipart: {
    expectedVersion: '2', file: { name: 'verbotene-fremde-version.png', mimeType: 'image/png', buffer: pngV1 },
  } })).status()).toBe(404);
});
