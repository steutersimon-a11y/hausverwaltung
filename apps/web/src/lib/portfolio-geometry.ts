import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { PropertySummary } from "@atlas/db/contracts";

export interface BuildingProperties {
  propertyId: string;
  buildingId: string;
  heightM: number;
  heightKnown: boolean;
  source: string;
  vacantUnits: number;
}

const geoIsDisplayable = (property: PropertySummary) =>
  (property.geoStatus === "verified" || (property.geoStatus === "demo" && property.source === "demo")) &&
  Number.isFinite(property.latitude) &&
  Number.isFinite(property.longitude) &&
  property.latitude !== null &&
  property.longitude !== null &&
  Math.abs(property.latitude) <= 85 &&
  Math.abs(property.longitude) <= 180;

function isPolygon(value: unknown): value is Polygon {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) return false;
  return geometry.coordinates.every(
    (ring: unknown) => Array.isArray(ring) && ring.length >= 4 && ring.every(
      (position: unknown) => Array.isArray(position) && position.length >= 2 &&
        typeof position[0] === "number" && typeof position[1] === "number" &&
        Number.isFinite(position[0]) && Number.isFinite(position[1]) &&
        Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 85,
    ) && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1],
  );
}

function buildingFeatures(properties: readonly PropertySummary[]): FeatureCollection<Polygon, BuildingProperties> {
  const features: Feature<Polygon, BuildingProperties>[] = [];
  for (const property of properties) {
    if (!geoIsDisplayable(property)) continue;
    const buildings = property.buildings?.filter((building) => isPolygon(building.footprint)) ?? [];
    for (const building of buildings) {
      if (!isPolygon(building.footprint)) continue;
      const heightKnown = typeof building.heightM === "number" && Number.isFinite(building.heightM) && building.heightM > 0;
      features.push({
        type: "Feature",
        id: building.id,
        geometry: building.footprint,
        properties: {
          propertyId: property.id,
          buildingId: building.id,
          heightM: heightKnown ? building.heightM! : 0,
          heightKnown,
          source: property.source,
          vacantUnits: property.vacantUnitCount,
        },
      });
    }
    // A known footprint without a known building height remains a 2D polygon.
    if (!buildings.length && isPolygon(property.footprint)) {
      features.push({
        type: "Feature",
        id: property.id,
        geometry: property.footprint,
        properties: {
          propertyId: property.id,
          buildingId: property.id,
          heightM: 0,
          heightKnown: false,
          source: property.source,
          vacantUnits: property.vacantUnitCount,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export { buildingFeatures, geoIsDisplayable };
