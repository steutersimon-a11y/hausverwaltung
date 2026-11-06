import { describe, expect, it } from "vitest";
import type { PropertySummary } from "@atlas/db/contracts";
import { buildingFeatures } from "../../apps/web/src/lib/portfolio-geometry";

const footprint = {
  type: "Polygon" as const,
  coordinates: [[[10, 50], [10.0002, 50], [10.0002, 50.0001], [10, 50.0001], [10, 50]]],
};

function property(overrides: Partial<PropertySummary> = {}): PropertySummary {
  return {
    id: "synthetic-property",
    code: "DEMO-001",
    name: "Ausdrücklich fiktives Testobjekt",
    street: "Synthetische Testadresse",
    houseNumber: "1",
    postalCode: "00000",
    city: "Fiktiver Democampus",
    latitude: 50.00005,
    longitude: 10.0001,
    geoStatus: "demo",
    footprint,
    managementType: "rental",
    source: "demo",
    note: "Nur synthetischer Testdatensatz",
    revision: 1,
    unitCount: 4,
    vacantUnitCount: 1,
    openTaskCount: 0,
    buildings: [{ id: "synthetic-building", name: "Demogebäude", heightM: 12, footprint }],
    ...overrides,
  };
}

describe("geometry visibility follows provenance and review status", () => {
  it("renders an explicitly synthetic building using its stored height", () => {
    const data = buildingFeatures([property()]);
    expect(data.features).toHaveLength(1);
    expect(data.features[0]?.properties.heightM).toBe(12);
    expect(data.features[0]?.geometry).toEqual(footprint);
  });

  it.each(["unverified", "missing"] as const)("keeps %s locations off the map", (geoStatus) => {
    expect(buildingFeatures([property({ geoStatus })]).features).toHaveLength(0);
  });

  it("cannot mislabel a manual location as a synthetic demo to bypass review", () => {
    expect(buildingFeatures([property({ source: "manual", geoStatus: "demo" })]).features).toHaveLength(0);
  });

  it("keeps missing, infinite and out-of-range coordinates off the map", () => {
    for (const latitude of [null, Number.NaN, Number.POSITIVE_INFINITY, 91]) {
      expect(buildingFeatures([property({ latitude })]).features).toHaveLength(0);
    }
  });

  it("does not invent a height for a verified building", () => {
    const record = property({ source: "manual", geoStatus: "verified", buildings: [{ id: "synthetic-building", name: "Testgebäude", footprint, heightM: null }] });
    const data = buildingFeatures([record]);
    expect(data.features).toHaveLength(1);
    expect(data.features[0]?.properties).toMatchObject({ heightM: 0, heightKnown: false });
  });

  it("keeps a known property footprint two-dimensional when no building model exists", () => {
    const data = buildingFeatures([property({ buildings: [] })]);
    expect(data.features[0]?.properties.heightKnown).toBe(false);
    expect(data.features[0]?.properties.heightM).toBe(0);
  });

  it("does not render malformed or unclosed polygons", () => {
    const invalid = { type: "Polygon" as const, coordinates: [[[10, 50], [10.1, 50], [10.1, 50.1], [10, 50.1]]] };
    expect(buildingFeatures([property({ footprint: invalid, buildings: [] })]).features).toHaveLength(0);
  });

  it("sends only aggregated model attributes to the map source", () => {
    const attributes = buildingFeatures([property()]).features[0]?.properties;
    expect(Object.keys(attributes ?? {}).sort()).toEqual(["buildingId", "heightKnown", "heightM", "propertyId", "source", "vacantUnits"]);
  });
});
