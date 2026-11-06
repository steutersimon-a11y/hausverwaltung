import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImportProperty } from '../../packages/integrations/src/imports';
import type { ImportReviewDto } from '../../packages/integrations/src/contracts';
import type { PortfolioResponse } from '../../packages/db/src/contracts';
import { createHarness, fileUpload, json, pngV1, type Harness } from './support';

let app: Harness;
beforeEach(async () => { app = await createHarness(); await app.bootstrap(); });
afterEach(async () => { await app?.dispose(); });
const encoder = new TextEncoder();
const csv = 'sourceRecordId;code;name;reportedUnitCount\nSYNTHETIC-IMPORT-1;FICTIONAL-IMP-1;Fiktives Reviewobjekt;7\n';
const recordsInput = (review: ImportReviewDto) => review.records.map(row => ({ id: row.id, revision: row.revision, sourceLine: row.sourceLine, included: row.included, confirmed: row.confirmed, data: row.data }));
async function stage(contents = csv, name = 'fiktive-quelle.csv', mime = 'text/csv'): Promise<ImportReviewDto> {
  const response = await app.api('/api/atlas/imports', { method: 'POST', body: fileUpload(encoder.encode(contents), { sourceSystem: 'synthetic-test', dataClass: 'synthetic' }, name, mime) });
  expect(response.status).toBe(201);
  return json<ImportReviewDto>(response);
}
async function save(review: ImportReviewDto, modify: (data: ImportProperty) => ImportProperty = data => ({ ...data, managementType: 'rental' })): Promise<ImportReviewDto> {
  const response = await app.api(`/api/atlas/imports/${review.batch.id}`, { method: 'PATCH', json: { revision: review.batch.revision,
    records: review.records.map(row => ({ id: row.id, revision: row.revision, sourceLine: row.sourceLine, included: true, confirmed: true, data: modify(row.data) })) } });
  expect(response.status).toBe(200);
  return json<ImportReviewDto>(response);
}
const commit = (review: ImportReviewDto) => app.api(`/api/atlas/imports/${review.batch.id}/commit`, { method: 'POST', json: { revision: review.batch.revision, confirmed: true } });

describe('hosted import review with private R2 sources and atomic D1 state', () => {
  it('requires an explicit mandate and review, preserves unknown fields and repeats without duplicate properties', async () => {
    const initial = await stage();
    expect(initial.records[0]?.data).toMatchObject({ managementType: null, reportedUnitCount: 7, street: null, houseNumber: null, postalCode: null, city: null });
    expect(initial.summary).toMatchObject({ invalid: 1, unconfirmed: 1 });
    expect((await commit(initial)).status).toBe(422);
    const reviewed = await save(initial);
    expect(reviewed.summary).toMatchObject({ new: 1, invalid: 0, unconfirmed: 0 });
    expect((await commit(reviewed)).status).toBe(200);
    expect((await commit(reviewed)).status).toBe(200);
    const portfolio = await json<PortfolioResponse & { properties: Array<PortfolioResponse['properties'][number] & { reportedTotalUnits: number | null }> }>(await app.api('/api/atlas/portfolio'));
    const imported = portfolio.properties.filter(property => property.code === 'FICTIONAL-IMP-1');
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ unitCount: 0, reportedTotalUnits: 7, latitude: null, longitude: null, geoStatus: 'missing', buildings: [] });
    const repeat = await save(await stage());
    expect(repeat.summary).toMatchObject({ unchanged: 1, new: 0, conflict: 0 });
    expect((await commit(repeat)).status).toBe(200);
    const stored = await app.database.prepare('SELECT data FROM app_state').first<{ data: string }>();
    const state = JSON.parse(stored!.data) as { units: unknown[]; audit: Array<{ action: string }> };
    expect(state.units).toHaveLength(0);
    expect(state.audit.filter(event => event.action === 'property.imported')).toHaveLength(1);
  });

  it('protects source downloads, preserves bytes and never leaks R2 keys in review responses', async () => {
    const reviewed = await stage();
    expect(JSON.stringify(reviewed)).not.toContain('storageKey');
    expect((await app.api(reviewed.batch.sourceUrl, { actor: 'anonymous' })).status).toBe(401);
    expect((await app.api('/api/atlas/imports/99999999-9999-4999-8999-999999999999/source')).status).toBe(404);
    const source = await app.api(reviewed.batch.sourceUrl);
    expect(source.status).toBe(200);
    expect(source.headers.get('Content-Type')).toBe('text/csv');
    expect(source.headers.get('Cache-Control')).toMatch(/private|no-store/);
    expect(await source.text()).toBe(csv);
  });

  it('rejects stale review writes, removed rows and conflicting source identities', async () => {
    const first = await stage();
    const reviewed = await save(first);
    const stale = await app.api(`/api/atlas/imports/${first.batch.id}`, { method: 'PATCH', json: { revision: first.batch.revision, records: recordsInput(first) } });
    expect(stale.status).toBe(409);
    const removed = await app.api(`/api/atlas/imports/${first.batch.id}`, { method: 'PATCH', json: { revision: reviewed.batch.revision, records: [] } });
    expect(removed.status).toBe(422);
    expect((await commit(reviewed)).status).toBe(200);
    const changed = await save(await stage(csv.replace('Fiktives Reviewobjekt', 'Geändertes fiktives Objekt')));
    expect(changed.summary.conflict).toBe(1);
    expect((await commit(changed)).status).toBe(422);
    const updated = await app.api(`/api/atlas/imports/${reviewed.batch.id}`, { method: 'PATCH', json: { revision: reviewed.batch.revision, records: recordsInput(reviewed) } });
    expect(updated.status).toBe(409);
  });

  it('allows only one of two simultaneous review writes and retains the surviving revision', async () => {
    const review = await stage();
    const input = { revision: review.batch.revision, records: review.records.map(row => ({ id: row.id, revision: row.revision, sourceLine: row.sourceLine, included: true, confirmed: true, data: { ...row.data, managementType: 'rental' } })) };
    const responses = await Promise.all([0, 1].map(() => app.api(`/api/atlas/imports/${review.batch.id}`, { method: 'PATCH', json: input })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const reread = await json<ImportReviewDto>(await app.api(`/api/atlas/imports/${review.batch.id}`));
    expect(reread.batch.revision).toBe(2);
    expect(reread.records[0]?.revision).toBe(2);
  });

  it('commits racing batches with the same source identity without duplicating properties or audit changes', async () => {
    const first = await save(await stage()), second = await save(await stage());
    const responses = await Promise.all([commit(first), commit(second)]);
    expect(responses.some(response => response.status === 200)).toBe(true);
    expect(responses.every(response => [200, 409].includes(response.status))).toBe(true);
    expect((await commit(first)).status).toBe(200);
    expect((await commit(second)).status).toBe(200);
    const stored = await app.database.prepare('SELECT data FROM app_state').first<{ data: string }>();
    const state = JSON.parse(stored!.data) as { properties: Array<{ sourceRecordId: string | null }>; audit: Array<{ action: string }> };
    expect(state.properties.filter(property => property.sourceRecordId === 'SYNTHETIC-IMPORT-1')).toHaveLength(1);
    expect(state.audit.filter(event => event.action === 'property.imported')).toHaveLength(1);
    expect(state.audit.filter(event => event.action === 'import.committed')).toHaveLength(2);
  });

  it('cleans up only the newly staged R2 source when the bounded workspace rejects its state', async () => {
    const before = await app.bucket.list();
    const contents = 'sourceRecordId;name;managementType;note\n' + Array.from({ length: 500 }, (_, index) => `synthetic-large-${index};Fiktive Zeile ${index};rental;${'a'.repeat(3900)}\n`).join('');
    const response = await app.api('/api/atlas/imports', { method: 'POST', body: fileUpload(encoder.encode(contents), { sourceSystem: 'synthetic-test', dataClass: 'synthetic' }, 'fiktive-grosse-review.csv', 'text/csv') });
    expect(response.status).toBe(413);
    expect(await json<{ error: { code: string } }>(response)).toMatchObject({ error: { code: 'STATE_SIZE' } });
    expect((await app.bucket.list()).objects).toHaveLength(before.objects.length);
    const history = await json<{ batches: unknown[] }>(await app.api('/api/atlas/imports'));
    expect(history.batches).toHaveLength(0);
  });

  it('keeps formulas, duplicate identities, malformed bytes and unsupported files out of commits', async () => {
    const formula = await stage(csv.replace('Fiktives Reviewobjekt', '=1+1'));
    expect(formula.records[0]?.issues.some(issue => issue.code === 'formula')).toBe(true);
    expect((await commit(await save(formula))).status).toBe(422);
    const duplicate = await stage(`${csv}SYNTHETIC-IMPORT-1;FICTIONAL-IMP-2;Noch ein fiktives Objekt;3\n`);
    expect((await commit(await save(duplicate))).status).toBe(422);
    for (const [bytes, name, mime] of [
      [encoder.encode('<html>fiktiver Inhalt</html>'), 'fiktiver-screenshot.png', 'image/png'],
      [encoder.encode('fiktive Tabelle'), 'fiktive-tabelle.xlsx', 'application/octet-stream'],
      [Uint8Array.from([255, 255, 255]), 'fiktive-quelle.csv', 'text/csv'],
    ] as const) {
      const response = await app.api('/api/atlas/imports', { method: 'POST', body: fileUpload(bytes, { sourceSystem: 'synthetic-test', dataClass: 'synthetic' }, name, mime) });
      expect([415, 422]).toContain(response.status);
    }
    const oversized = await app.api('/api/atlas/imports', { method: 'POST', body: fileUpload(new Uint8Array(5 * 1024 * 1024 + 1), { sourceSystem: 'synthetic-test', dataClass: 'synthetic' }, 'fiktive-grosse-datei.csv', 'text/csv') });
    expect(oversized.status).toBe(413);
  });

  it('normalizes JSON scalar fields and rejects nested or oversized row collections', async () => {
    const review = await stage(JSON.stringify([{ sourceRecordId: 'SYNTHETIC-JSON-1', code: 'FICTIONAL-JSON-1', name: 'Fiktives JSON-Objekt', managementType: 'weg', reportedUnitCount: null }]), 'fiktive-quelle.json', 'application/json');
    expect(review.records[0]?.data).toMatchObject({ managementType: 'weg', reportedUnitCount: null, city: null });
    expect((await commit(await save(review, data => data))).status).toBe(200);
    for (const contents of [JSON.stringify([{ name: { nested: 'unzulässig' } }]), JSON.stringify(Array.from({ length: 501 }, (_, index) => ({ sourceRecordId: `synthetic-${index}`, name: 'Fiktive Zeile' })))]) {
      const response = await app.api('/api/atlas/imports', { method: 'POST', body: fileUpload(encoder.encode(contents), { sourceSystem: 'synthetic-test', dataClass: 'synthetic' }, 'fiktive-fehlerquelle.json', 'application/json') });
      expect(response.status).toBe(422);
    }
  });

  it('stages screenshots without OCR and accepts explicitly transcribed additional rows', async () => {
    const response = await app.api('/api/atlas/imports', { method: 'POST', body: fileUpload(pngV1, { sourceSystem: 'synthetic-image', dataClass: 'synthetic' }) });
    expect(response.status).toBe(201);
    const review = await json<ImportReviewDto>(response);
    expect(review.batch.format).toBe('screenshot');
    expect(review.records[0]?.data.managementType).toBeNull();
    expect(review.records[0]?.issues.some(issue => issue.code === 'manual_transcription')).toBe(true);
    const base = review.records[0]!;
    const records = [
      { id: base.id, revision: base.revision, sourceLine: 1, included: true, confirmed: true, data: { ...base.data, name: 'Fiktive Abschrift A', managementType: 'weg' } },
      { sourceLine: 2, included: true, confirmed: true, data: { ...base.data, sourceRecordId: 'synthetic-manual-2', name: 'Fiktive Abschrift B', managementType: 'rental' } },
    ];
    const saved = await app.api(`/api/atlas/imports/${review.batch.id}`, { method: 'PATCH', json: { revision: review.batch.revision, records } });
    expect(saved.status).toBe(200);
    const ready = await json<ImportReviewDto>(saved);
    expect(ready.summary).toMatchObject({ total: 2, new: 2, invalid: 0, unconfirmed: 0 });
    expect((await commit(ready)).status).toBe(200);
    const source = await app.api(review.batch.sourceUrl);
    expect(source.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(pngV1);
  });
});
