import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { ImportReviewDto } from '@atlas/integrations';
import { login, origin } from './support';

type Portfolio = { properties: { id: string; code: string; source: string; latitude: number | null; longitude: number | null; geoStatus: string; unitCount: number }[] };
const unique = () => randomUUID().replaceAll('-', '').slice(0, 16);

async function reviewBody(response: Pick<APIResponse, 'status' | 'json'>, status = 200): Promise<ImportReviewDto> {
  expect(response.status()).toBe(status);
  return await response.json() as ImportReviewDto;
}

async function upload(request: APIRequestContext, sourceSystem: string, name: string, mimeType: string, buffer: Buffer): Promise<APIResponse> {
  return request.post('/api/atlas/imports', {
    headers: { origin },
    multipart: { sourceSystem, dataClass: 'synthetic', file: { name, mimeType, buffer } },
  });
}

function confirmedSnapshot(review: ImportReviewDto) {
  return { revision: review.batch.revision, records: review.records.map(record => ({
    id: record.id, revision: record.revision, sourceLine: record.sourceLine,
    included: record.included, confirmed: record.included, data: record.data,
  })) };
}

async function confirm(request: APIRequestContext, review: ImportReviewDto): Promise<ImportReviewDto> {
  return reviewBody(await request.patch(`/api/atlas/imports/${review.batch.id}`, { headers: { origin }, data: confirmedSnapshot(review) }));
}

test('CSV review enforces confirmation and exact revisions, then imports idempotently without fabricated geometry or units', async ({ request }) => {
  await login(request);
  const suffix = unique();
  const sourceSystem = `e2e-csv-${suffix}`;
  const code = `FIKTIV-IMPORT-${suffix}`;
  const csv = Buffer.from(`\uFEFFsourceRecordId;code;name;street;houseNumber;postalCode;city;managementType;reportedUnitCount;note\nTEST-${suffix};${code};Fiktiver Importhof ${suffix};Fiktivstraße ${suffix};1;00000;Demostadt;rental;4;Ausschließlich synthetischer E2E-Test\n`, 'utf8');

  const staged = await reviewBody(await upload(request, sourceSystem, `fiktive-objekte-${suffix}.csv`, 'text/csv', csv), 201);
  expect(staged.batch.status).toBe('review');
  expect(staged.batch.dataClass).toBe('synthetic');
  expect(staged.summary).toMatchObject({ total: 1, new: 1, invalid: 0, conflict: 0, unconfirmed: 1 });
  expect(staged.records[0]?.data.reportedUnitCount).toBe(4);

  const unconfirmed = await request.post(`/api/atlas/imports/${staged.batch.id}/commit`, {
    headers: { origin }, data: { revision: staged.batch.revision, confirmed: true },
  });
  expect(unconfirmed.status()).toBe(422);
  expect((await unconfirmed.json()).error.code).toBe('IMPORT_NOT_READY');
  expect(((await (await request.get('/api/atlas/portfolio')).json()) as Portfolio).properties.some(property => property.code === code)).toBe(false);

  const checked = await confirm(request, staged);
  expect(checked.batch.revision).toBe(staged.batch.revision + 1);
  expect(checked.summary.unconfirmed).toBe(0);
  const stale = await request.post(`/api/atlas/imports/${staged.batch.id}/commit`, {
    headers: { origin }, data: { revision: staged.batch.revision, confirmed: true },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.code).toBe('REVISION_CONFLICT');

  const committed = await reviewBody(await request.post(`/api/atlas/imports/${checked.batch.id}/commit`, {
    headers: { origin }, data: { revision: checked.batch.revision, confirmed: true },
  }));
  expect(committed.batch.status).toBe('imported');
  expect(committed.batch.report).toMatchObject({ created: 1, unchanged: 0, noAutomaticGeocoding: true, noUnitsCreatedFromCounts: true });
  const portfolio = await (await request.get('/api/atlas/portfolio')).json() as Portfolio;
  const created = portfolio.properties.filter(property => property.code === code);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ source: 'demo', latitude: null, longitude: null, geoStatus: 'missing', unitCount: 0 });

  const repeatedCommit = await reviewBody(await request.post(`/api/atlas/imports/${checked.batch.id}/commit`, {
    headers: { origin }, data: { revision: checked.batch.revision, confirmed: true },
  }));
  expect(repeatedCommit.batch.revision).toBe(committed.batch.revision);
  expect(repeatedCommit.batch.importedAt).toBe(committed.batch.importedAt);
  expect(repeatedCommit.batch.report).toEqual(committed.batch.report);
  const immutable = await request.patch(`/api/atlas/imports/${committed.batch.id}`, { headers: { origin }, data: confirmedSnapshot(committed) });
  expect(immutable.status()).toBe(409);
  expect((await immutable.json()).error.code).toBe('IMPORT_IMMUTABLE');

  const repeatedFile = await reviewBody(await upload(request, sourceSystem, `fiktive-objekte-${suffix}.csv`, 'text/csv', csv), 201);
  expect(repeatedFile.batch.id).not.toBe(staged.batch.id);
  expect(repeatedFile.summary).toMatchObject({ new: 0, unchanged: 1, conflict: 0, invalid: 0, unconfirmed: 1 });
  const checkedAgain = await confirm(request, repeatedFile);
  const reimported = await reviewBody(await request.post(`/api/atlas/imports/${checkedAgain.batch.id}/commit`, {
    headers: { origin }, data: { revision: checkedAgain.batch.revision, confirmed: true },
  }));
  expect(reimported.batch.report).toMatchObject({ created: 0, unchanged: 1 });
  const after = await (await request.get('/api/atlas/portfolio')).json() as Portfolio;
  expect(after.properties.filter(property => property.code === code)).toHaveLength(1);
  const detail = await (await request.get(`/api/atlas/properties/${created[0]!.id}`)).json() as { audit: { action: string }[] };
  expect(detail.audit.filter(event => event.action === 'property.imported')).toHaveLength(1);
});

test('a generated screenshot remains a private manual source, review persists and unauthorized roles cannot download it', async ({ request, page, playwright }) => {
  await login(request);
  const suffix = unique();
  const code = `FIKTIV-BILD-${suffix}`;
  const filename = `fiktive-quellliste-${suffix}.png`;
  // An actual PNG created exclusively for this test. No real portfolio screenshot
  // or inferred building/party data is embedded in the repository or test output.
  const pngBase64 = await page.evaluate((objectCode: string) => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 240;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Synthetische Testdatei kann nicht erzeugt werden.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#162c36'; context.font = 'bold 22px sans-serif';
    context.fillText('FIKTIVE TESTLISTE · KEINE ECHTEN VERWALTUNGSOBJEKTE', 25, 40);
    context.font = '18px sans-serif';
    context.fillText('Bezeichnung: Fiktives Testhaus', 25, 95);
    context.fillText(`Objektcode: ${objectCode}`, 25, 135);
    context.fillText('Verwaltungsart: Mietverwaltung (Demo)', 25, 175);
    context.font = '14px sans-serif';
    context.fillText('Adresse, Einheitenzahlen und Koordinaten sind nicht angegeben.', 25, 215);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  }, code);
  const png = Buffer.from(pngBase64, 'base64');
  const staged = await reviewBody(await upload(request, `e2e-bild-${suffix}`, filename, 'image/png', png), 201);
  expect(staged.batch).toMatchObject({ format: 'screenshot', dataClass: 'synthetic', status: 'review' });
  expect(staged.records).toHaveLength(1);
  expect(staged.records[0]?.data).toMatchObject({ name: null, code: null, street: null, houseNumber: null, postalCode: null, city: null, managementType: null, reportedUnitCount: null });
  expect(staged.records[0]?.issues.some(issue => issue.code === 'manual_transcription')).toBe(true);
  expect(staged.summary.invalid).toBe(1);

  const original = await request.get(staged.batch.sourceUrl);
  expect(original.status()).toBe(200);
  expect(original.headers()['content-type']).toContain('image/png');
  expect(original.headers()['cache-control']).toContain('no-store');
  expect(original.headers()['x-content-type-options']).toBe('nosniff');
  expect(await original.body()).toEqual(png);

  // Reuse the synthetic administrator session for the actual browser review,
  // without another sign-in attempt or a bypass of authentication/rate limits.
  await page.context().addCookies((await request.storageState()).cookies);
  await page.goto('/importe');
  await page.locator('.batch-item').filter({ hasText: filename }).click();
  await expect(page.getByText('Originalbild zur manuellen Abschrift', { exact: true })).toBeVisible();
  const sourceImage = page.getByAltText('Original der hochgeladenen Objektliste zur manuellen Abschrift', { exact: true });
  await expect(sourceImage).toBeVisible();
  await expect.poll(() => sourceImage.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.getByLabel('Objektbezeichnung, Quellzeile 1', { exact: true }).fill('Fiktives Testhaus');
  await page.getByLabel('Objektcode, Quellzeile 1', { exact: true }).fill(code);
  await page.getByLabel('Verwaltungsart, Quellzeile 1', { exact: true }).selectOption('rental');
  await page.getByLabel('Quellzeile 1 geprüft', { exact: true }).check();
  const saveResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/atlas/imports/${staged.batch.id}` && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Review speichern', exact: true }).click();
  const saved = await reviewBody(await saveResponse);
  expect(saved.batch.status).toBe('review');
  expect(saved.records[0]?.data).toMatchObject({ code, name: 'Fiktives Testhaus', street: null, houseNumber: null, postalCode: null, city: null, managementType: 'rental' });
  expect(saved.records[0]?.confirmed).toBe(true);
  expect(saved.summary).toMatchObject({ new: 1, invalid: 0, conflict: 0, warning: 1, unconfirmed: 0 });
  await page.reload();
  await page.locator('.batch-item').filter({ hasText: filename }).click();
  await expect(page.getByLabel('Objektbezeichnung, Quellzeile 1', { exact: true })).toHaveValue('Fiktives Testhaus');
  await expect(page.getByLabel('Quellzeile 1 geprüft', { exact: true })).toBeChecked();
  expect(((await (await request.get('/api/atlas/portfolio')).json()) as Portfolio).properties.some(property => property.code === code)).toBe(false);

  await login(request, 'editor@atlas.example');
  expect((await request.get(`/api/atlas/imports/${staged.batch.id}`)).status()).toBe(403);
  expect((await request.get(staged.batch.sourceUrl)).status()).toBe(403);
  expect((await request.post(`/api/atlas/imports/${staged.batch.id}/commit`, { headers: { origin }, data: { revision: saved.batch.revision, confirmed: true } })).status()).toBe(403);
  await login(request, 'extern@atlas.example');
  for (const path of [`/api/atlas/imports/${staged.batch.id}`, staged.batch.sourceUrl]) {
    const denied = await request.get(path);
    expect([403, 404]).toContain(denied.status());
    expect(await denied.text()).not.toContain(filename);
  }
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try { expect((await anonymous.get(staged.batch.sourceUrl)).status()).toBe(401); }
  finally { await anonymous.dispose(); }
});

test('malformed and oversized sources are rejected; formulas and duplicate identities remain blocked in review', async ({ request }) => {
  await login(request);
  const suffix = unique();
  const source = `e2e-grenzen-${suffix}`;
  const malformed = await upload(request, source, 'fiktiv-ungueltig.json', 'application/json', Buffer.from('{'));
  expect(malformed.status()).toBe(422);
  expect((await malformed.json()).error.code).toBe('INVALID_JSON');
  const notAnImage = await upload(request, source, 'fiktiv-kein-bild.png', 'image/png', Buffer.from('No PNG content in this synthetic fixture.'));
  expect([415, 422]).toContain(notAnImage.status());
  const unsupported = await upload(request, source, 'fiktiv-nicht-unterstuetzt.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('not an XLSX parser input'));
  expect(unsupported.status()).toBe(415);
  const oversized = await upload(request, source, 'fiktiv-zu-gross.csv', 'text/csv', Buffer.alloc(5 * 1024 * 1024 + 1, 65));
  expect(oversized.status()).toBe(413);

  const formula = await reviewBody(await upload(request, source, 'fiktiv-formel.json', 'application/json', Buffer.from(JSON.stringify([
    { sourceRecordId: `FORMEL-${suffix}`, code: `FIKTIV-FORMEL-${suffix}`, name: '=1+1', managementType: 'rental' },
  ]))), 201);
  expect(formula.summary.invalid).toBe(1);
  expect(formula.records[0]?.issues.some(issue => issue.code === 'formula' && issue.severity === 'error')).toBe(true);
  const formulaChecked = await confirm(request, formula);
  expect((await request.post(`/api/atlas/imports/${formula.batch.id}/commit`, { headers: { origin }, data: { revision: formulaChecked.batch.revision, confirmed: true } })).status()).toBe(422);

  const duplicate = await reviewBody(await upload(request, source, 'fiktiv-doppelte-ids.json', 'application/json', Buffer.from(JSON.stringify([
    { sourceRecordId: `DOPPELT-${suffix}`, name: 'Fiktives Testobjekt A', managementType: 'rental' },
    { sourceRecordId: `DOPPELT-${suffix}`, name: 'Fiktives Testobjekt B', managementType: 'rental' },
  ]))), 201);
  expect(duplicate.summary.invalid).toBe(2);
  expect(duplicate.records.every(record => record.issues.some(issue => issue.code === 'duplicate_source_id'))).toBe(true);
  const duplicateChecked = await confirm(request, duplicate);
  expect((await request.post(`/api/atlas/imports/${duplicate.batch.id}/commit`, { headers: { origin }, data: { revision: duplicateChecked.batch.revision, confirmed: true } })).status()).toBe(422);
});
