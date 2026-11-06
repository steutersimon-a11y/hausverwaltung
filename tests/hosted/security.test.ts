import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentDto, UnitDto } from '../../packages/db/src/contracts';
import { createHarness, fileUpload, ids, json, origin, pngV1, serviceSecret, unitInput, type Harness } from './support';

let app: Harness;
beforeEach(async () => { app = await createHarness(); await app.bootstrap(); });
afterEach(async () => { await app?.dispose(); });

async function createUnit(propertyId = ids.property): Promise<UnitDto> {
  const input = propertyId === ids.property ? unitInput() : { ...unitInput('OTHER-FICTIONAL-UNIT'), propertyId, buildingId: ids.otherBuilding, floorId: ids.otherFloor };
  const response = await app.api('/api/atlas/units', { method: 'POST', json: input });
  expect(response.status).toBe(201);
  return (await json<{ unit: UnitDto }>(response)).unit;
}

describe('hosted API authorization and request boundaries', () => {
  it('requires trusted platform identity or the additional service secret before data access', async () => {
    // Sites validates visitor identity headers and dispatch access before Worker execution.
    // These tests exercise the Worker boundary; they do not emulate platform token verification.
    expect((await app.api('/api/atlas/portfolio', { actor: 'anonymous' })).status).toBe(401);
    expect((await app.api('/api/atlas/portfolio', { actor: 'anonymous', headers: { 'X-Atlas-Service-Authorization': 'Bearer invalid-synthetic-secret' } })).status).toBe(401);
    const service = await app.api('/api/atlas/portfolio', { actor: 'service' });
    expect(service.status).toBe(200);
    const encoded = await service.text();
    expect(encoded).not.toContain(serviceSecret);
    expect(encoded).not.toContain('storageKey');
    expect((await app.api('/api/atlas/portfolio')).status).toBe(200);
    expect((await app.api('/portfolio', { actor: 'anonymous' })).status).toBe(401);
    expect((await app.api('/api/atlas/bootstrap', { method: 'POST', json: { properties: [] } })).status).toBe(403);
  });

  it('rejects wrong, absent and cross-site browser mutation origins before changing D1', async () => {
    const attempts = [
      { origin: 'https://untrusted.invalid' },
      { origin: null },
      { origin, headers: { 'Sec-Fetch-Site': 'cross-site' } },
    ];
    const before = await app.database.prepare('SELECT revision FROM app_state').first<{ revision: number }>();
    for (const attempt of attempts) {
      const response = await app.api('/api/atlas/units', { method: 'POST', json: unitInput(), ...attempt });
      expect(response.status).toBe(403);
    }
    const after = await app.database.prepare('SELECT revision FROM app_state').first<{ revision: number }>();
    expect(after?.revision).toBe(before?.revision);
    const detail = await json<{ buildings: Array<{ floors: Array<{ units: unknown[] }> }> }>(await app.api(`/api/atlas/properties/${ids.property}`));
    expect(detail.buildings.flatMap(building => building.floors.flatMap(floor => floor.units))).toHaveLength(0);
  });

  it('rejects mismatched building, floor, property and unit associations', async () => {
    const invalidHierarchy = await app.api('/api/atlas/units', { method: 'POST', json: { ...unitInput(), buildingId: ids.otherBuilding, floorId: ids.otherFloor } });
    expect([404, 422]).toContain(invalidHierarchy.status);
    const other = await createUnit(ids.otherProperty);
    const invalidTask = await app.api('/api/atlas/tasks', { method: 'POST', json: { propertyId: ids.property, unitId: other.id, title: 'Nicht anzulegende fiktive Aufgabe' } });
    expect([404, 422]).toContain(invalidTask.status);
    const invalidDocument = await app.api('/api/atlas/documents', { method: 'POST', body: fileUpload(pngV1, { propertyId: ids.property, unitId: other.id, kind: 'floorplan' }) });
    expect([404, 422]).toContain(invalidDocument.status);
    const tasks = await json<{ tasks: unknown[] }>(await app.api(`/api/atlas/tasks?propertyId=${ids.property}`));
    expect(tasks.tasks).toHaveLength(0);
    const documents = await json<{ documents: unknown[] }>(await app.api(`/api/atlas/documents?propertyId=${ids.property}`));
    expect(documents.documents).toHaveLength(0);
  });

  it('validates file bytes rather than trusting extensions or MIME labels', async () => {
    const unit = await createUnit();
    const disguisedHtml = new TextEncoder().encode('<html><script>throw new Error("fictional fixture")</script></html>');
    for (const [name, mimeType, bytes] of [
      ['fiktiver-plan.png', 'image/png', disguisedHtml],
      ['fiktiver-plan.pdf', 'application/pdf', pngV1],
      ['fiktiver-plan.html', 'text/html', disguisedHtml],
    ] as const) {
      const response = await app.api('/api/atlas/documents', { method: 'POST', body: fileUpload(bytes, { propertyId: ids.property, unitId: unit.id, kind: 'floorplan' }, name, mimeType) });
      expect([400, 413, 415, 422]).toContain(response.status);
    }
    const documents = await json<{ documents: unknown[] }>(await app.api(`/api/atlas/documents?propertyId=${ids.property}`));
    expect(documents.documents).toHaveLength(0);
  });

  it('reauthorizes direct downloads and does not expose underlying storage keys', async () => {
    const unit = await createUnit();
    const response = await app.api('/api/atlas/documents', { method: 'POST', body: fileUpload(pngV1, { propertyId: ids.property, unitId: unit.id, kind: 'floorplan' }) });
    expect(response.status).toBe(201);
    const created = (await json<{ document: DocumentDto }>(response)).document;
    expect((await app.api(created.downloadUrl, { actor: 'anonymous' })).status).toBe(401);
    expect((await app.api('/api/atlas/documents/99999999-9999-4999-8999-999999999999/content')).status).toBe(404);
    const content = await app.api(created.downloadUrl);
    expect(content.status).toBe(200);
    expect(content.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(content.headers.get('Cache-Control')).toMatch(/no-store|private/);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(pngV1);
    expect(JSON.stringify(created)).not.toMatch(/storageKey|ATLAS_SERVICE_SECRET|Bearer /);
  });
});
