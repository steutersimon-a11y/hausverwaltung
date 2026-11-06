import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { createWorker } from '../../apps/hosted/workerlogic';
import type { Env, HostedProperty } from '../../apps/hosted/server/types';

export const origin = 'https://atlas-hosted-tests.example';
export const serviceSecret = 'synthetic-hosted-service-test-secret-only';
export const ids = {
  property: '11111111-1111-4111-8111-111111111111',
  otherProperty: '22222222-2222-4222-8222-222222222222',
  building: '33333333-3333-4333-8333-333333333333',
  otherBuilding: '44444444-4444-4444-8444-444444444444',
  floor: '55555555-5555-4555-8555-555555555555',
  otherFloor: '66666666-6666-4666-8666-666666666666',
};

/** Everything in this fixture is explicitly fictional. No original portfolio data. */
export function syntheticProperties(): HostedProperty[] {
  return [false, true].map(other => ({
    id: other ? ids.otherProperty : ids.property,
    code: other ? 'HOSTED-TEST-B' : 'HOSTED-TEST-A',
    name: other ? 'Fiktives Testobjekt B' : 'Fiktives Testobjekt A',
    street: other ? null : 'Ausgedachte Testgasse',
    houseNumber: other ? null : '101',
    postalCode: other ? null : '00000',
    city: other ? null : 'Fiktiver Testort',
    latitude: null,
    longitude: null,
    geoStatus: 'missing',
    footprint: null,
    managementType: other ? null : 'rental',
    source: 'demo',
    note: 'Synthetisches Testobjekt, keine reale Immobilie.',
    revision: 1,
    reportedTotalUnits: other ? null : 6,
    reportedResidentialUnits: other ? null : 4,
    reportedParkingUnits: other ? null : 2,
    buildings: [{
      id: other ? ids.otherBuilding : ids.building,
      name: 'Fiktives Testgebäude',
      heightM: null,
      footprint: null,
      entrances: [],
      floors: [{ id: other ? ids.otherFloor : ids.floor, name: 'Fiktives Testgeschoss', level: 0, entranceId: null, units: [] }],
    }],
  }));
}

interface ApiInit extends Omit<RequestInit, 'headers'> {
  actor?: 'browser' | 'service' | 'anonymous';
  origin?: string | null;
  headers?: HeadersInit;
  json?: unknown;
}

export async function createHarness() {
  const runtime = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("storage-test-harness"); } };',
    compatibilityDate: '2025-10-01',
    d1Databases: ['DB'],
    r2Buckets: ['BUCKET'],
  });
  const database = await runtime.getD1Database('DB');
  const bucket = await runtime.getR2Bucket('BUCKET');
  const migration = await readFile(fileURLToPath(new URL('../../apps/hosted/drizzle/0000_hosted_state.sql', import.meta.url)), 'utf8');
  try {
    for (const statement of migration.split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
  // Miniflare maps Worker overloads/streams to Node types. Normalize its real R2
  // proxy to the subset used by the handler; storage still lives in Miniflare.
  const boundBucket: Env['BUCKET'] = {
    put: (key, value, options) => bucket.put(key, value, options),
    async get(key) {
      const object = await bucket.get(key, {});
      if (!object) return null;
      if (!('arrayBuffer' in object)) throw new Error('Expected an unconditional R2 body.');
      const body = new Response(await object.arrayBuffer()).body;
      if (!body) throw new Error('Expected an R2 response body.');
      return { body, size: object.size, httpMetadata: object.httpMetadata };
    },
    delete: key => bucket.delete(key),
  };
  const env: Env = { DB: database, BUCKET: boundBucket, ATLAS_SERVICE_SECRET: serviceSecret };
  const worker = createWorker(() => null);

  async function api(path: string, input: ApiInit = {}): Promise<Response> {
    const { actor = 'browser', origin: selectedOrigin, headers: suppliedHeaders, json, ...options } = input;
    const headers = new Headers();
    if (actor === 'browser') {
      headers.set('oai-authenticated-user-id', 'synthetic-private-site-owner');
      headers.set('oai-authenticated-user-email', 'synthetic-owner@example.invalid');
      headers.set('oai-authenticated-user-full-name', 'Fiktive Testverwaltung');
    } else if (actor === 'service') {
      headers.set('X-Atlas-Service-Authorization', `Bearer ${serviceSecret}`);
    }
    const method = options.method?.toUpperCase() ?? 'GET';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && actor === 'browser' && selectedOrigin !== null) {
      headers.set('Origin', selectedOrigin ?? origin);
      headers.set('Sec-Fetch-Site', 'same-origin');
    } else if (selectedOrigin) headers.set('Origin', selectedOrigin);
    if (json !== undefined) headers.set('Content-Type', 'application/json');
    new Headers(suppliedHeaders).forEach((value, name) => headers.set(name, value));
    const request = new Request(`${origin}${path}`, { ...options, headers, ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
    return worker.fetch(request, env);
  }

  async function bootstrap(): Promise<void> {
    const response = await api('/api/atlas/bootstrap', { method: 'POST', actor: 'service', json: { properties: syntheticProperties() } });
    if (!response.ok) throw new Error(`Synthetic bootstrap failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return { api, bootstrap, database, bucket, env, dispose: () => runtime.dispose() };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
export async function json<T>(response: Response): Promise<T> { return await response.json() as T; }

export function unitInput(code = 'FICTIONAL-UNIT-1') {
  return {
    propertyId: ids.property, buildingId: ids.building, floorId: ids.floor,
    code, label: 'Ausdrücklich fiktive Testeinheit', usage: 'residential', status: 'vacant',
    areaM2: 61.25, rooms: 2.5, note: 'Synthetischer HTTP-Test, keine echte Wohnung.',
  };
}

// Generated tiny PNGs, no actual floorplan or person content.
export const pngV1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6f3cAAAAASUVORK5CYII=', 'base64'));
export const pngV2 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFUlEQVR4nGN8/uouAwMDEwMDA4ICADNIArT7sdOCAAAAAElFTkSuQmCC', 'base64'));

export function fileUpload(bytes: Uint8Array, fields: Record<string, string>, name = 'fiktiver-testplan.png', mimeType = 'image/png'): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', new File([bytes.slice().buffer], name, { type: mimeType }));
  return form;
}
