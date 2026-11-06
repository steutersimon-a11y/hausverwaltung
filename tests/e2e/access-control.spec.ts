import { test, expect, type APIRequestContext } from "@playwright/test";

import { login, origin } from "./support";
type Portfolio = { properties: { id: string; code: string; geoStatus: string }[] };
type PropertyDetail = { buildings: { floors: { units: { id: string; revision: number; areaM2: number | null; rooms: number | null; label: string; status: string; note: string | null }[] }[] }[] };

async function fixture(request: APIRequestContext) {
  const portfolio = await request.get("/api/atlas/portfolio");
  expect(portfolio.ok()).toBeTruthy();
  const body = await portfolio.json() as Portfolio;
  const property = body.properties.find(p => p.code === "DEMO-001")!;
  expect(property).toBeTruthy();
  const detail = await request.get(`/api/atlas/properties/${property.id}`);
  const data = await detail.json() as PropertyDetail;
  const unit = data.buildings[0]!.floors[0]!.units[0]!;
  return { property, unit };
}

test("anonymous API access is denied without disclosing portfolio data", async ({ request }) => {
  const response = await request.get("/api/atlas/portfolio");
  expect(response.status()).toBe(401);
  expect(JSON.stringify(await response.json())).not.toContain("Hafenhof");
});

test("same organization still requires an explicit property grant", async ({ request }) => {
  await login(request);
  const all = await (await request.get("/api/atlas/portfolio")).json() as Portfolio;
  const hidden = all.properties.find(p => p.code === "DEMO-002")!;
  expect(hidden).toBeTruthy();
  await login(request, "editor@atlas.example");
  const limited = await (await request.get("/api/atlas/portfolio")).json() as Portfolio;
  expect(limited.properties.some(p => p.id === hidden.id)).toBeFalsy();
  expect((await request.get(`/api/atlas/properties/${hidden.id}`)).status()).toBe(404);
});

test("foreign organization cannot read a known property or select another organization", async ({ request }) => {
  await login(request);
  const { property, unit } = await fixture(request);
  await login(request, "extern@atlas.example");
  expect((await request.get(`/api/atlas/properties/${property.id}`)).status()).toBe(404);
  expect((await request.get(`/api/atlas/units/${unit.id}`)).status()).toBe(404);
  const response = await request.get("/api/atlas/portfolio", { headers: { "x-organization-id": "10000000-0000-4000-8000-000000000001" } });
  expect(response.status()).toBe(403);
});

test("unit updates validate, persist, audit and reject an obsolete revision", async ({ request }) => {
  await login(request);
  const { unit } = await fixture(request);
  const url = `/api/atlas/units/${unit.id}`;
  const invalid = await request.patch(url, { headers: { origin }, data: { ...unit, areaM2: -5 } });
  expect(invalid.status()).toBe(422);
  const note = "Synthetischer API-Test: gespeicherte Änderung mit Revision.";
  const changed = await request.patch(url, { headers: { origin }, data: { revision: unit.revision, areaM2: 64.25, rooms: unit.rooms, status: unit.status, note } });
  expect(changed.ok()).toBeTruthy();
  const reloaded = await (await request.get(url)).json();
  expect(reloaded.unit.areaM2).toBe(64.25);
  expect(reloaded.unit.note).toBe(note);
  expect(reloaded.unit.revision).toBe(unit.revision + 1);
  expect(reloaded.audit.length).toBeGreaterThan(0);
  const stale = await request.patch(url, { headers: { origin }, data: { revision: unit.revision, areaM2: 20, rooms: unit.rooms, status: unit.status, note: "veraltete Änderung" } });
  expect(stale.status()).toBe(409);
  expect((await (await request.get(url)).json()).unit.areaM2).toBe(64.25);
});

test("cross-origin writes and read-only writes are denied", async ({ request }) => {
  await login(request);
  const { unit } = await fixture(request);
  const data = { revision: unit.revision, areaM2: unit.areaM2, rooms: unit.rooms, status: unit.status, note: "Nicht übernehmen" };
  expect((await request.patch(`/api/atlas/units/${unit.id}`, { headers: { origin: "https://untrusted.example" }, data })).status()).toBe(403);
  expect((await request.patch(`/api/atlas/units/${unit.id}`, { data })).status()).toBe(403);
  await login(request, "readonly@atlas.example");
  expect((await request.patch(`/api/atlas/units/${unit.id}`, { headers: { origin }, data })).status()).toBe(403);
});

test("document bytes stay private and uploads require valid content", async ({ request }) => {
  await login(request);
  const { property, unit } = await fixture(request);
  const bad = await request.post("/api/atlas/documents", { headers: { origin }, multipart: { propertyId: property.id, unitId: unit.id, kind: "floorplan", file: { name: "kein-grundriss.png", mimeType: "image/png", buffer: Buffer.from("This is not a PNG") } } });
  expect(bad.status()).toBe(415);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6f3cAAAAASUVORK5CYII=", "base64");
  const upload = await request.post("/api/atlas/documents", { headers: { origin }, multipart: { propertyId: property.id, unitId: unit.id, kind: "floorplan", file: { name: "synthetischer-testgrundriss.png", mimeType: "image/png", buffer: png } } });
  expect(upload.ok()).toBeTruthy();
  const saved = await upload.json();
  const id = saved.document?.id ?? saved.id;
  expect(id).toBeTruthy();
  const own = await request.get(`/api/atlas/documents/${id}/content`);
  expect(own.ok()).toBeTruthy();
  expect(await own.body()).toEqual(png);
  expect(own.headers()["cache-control"]).toContain("no-store");
  await login(request, "extern@atlas.example");
  expect((await request.get(`/api/atlas/documents/${id}/content`)).status()).toBe(404);
});
