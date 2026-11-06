import type { Feature, FeatureCollection, Polygon } from "geojson";

/** The map only receives aggregate property data; parties and financial data stay out. */
export interface MapProperty {
  id: string;
  code: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  geoStatus: string;
  source: string;
  footprint: Polygon | null;
  buildings?: readonly { id: string; heightM: number | null; footprint: Polygon | null }[];
  modelUrl?: string | null;
  reportedTotalUnits?: number | null;
  reportedResidentialUnits?: number | null;
  reportedParkingUnits?: number | null;
  unitCount?: number | null;
  vacantUnitCount?: number | null;
  openTaskCount?: number | null;
}

export interface BuildingProperties {
  propertyId: string;
  buildingId: string;
  heightM: number;
  heightKnown: boolean;
  source: string;
  vacantUnits: number;
}

const geoIsDisplayable = (property: MapProperty) =>
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

function buildingFeatures(properties: readonly MapProperty[]): FeatureCollection<Polygon, BuildingProperties> {
  const features: Feature<Polygon, BuildingProperties>[] = [];
  for (const property of properties) {
    if (!geoIsDisplayable(property)) continue;
    const buildings = property.buildings?.filter((building) => isPolygon(building.footprint)) ?? [];
    for (const building of buildings) {
      if (!isPolygon(building.footprint)) continue;
      // An exact uploaded surface model supplies its own roofs and walls.
      // Its footprint remains flat to avoid a second, extruded shell.
      const heightKnown = !property.modelUrl && typeof building.heightM === "number" && Number.isFinite(building.heightM) && building.heightM > 0;
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
          vacantUnits: property.vacantUnitCount ?? 0,
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
          vacantUnits: property.vacantUnitCount ?? 0,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export { buildingFeatures, geoIsDisplayable };
