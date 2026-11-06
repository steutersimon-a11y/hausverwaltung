/** Browser-safe DTOs. Runtime DB imports must never be used by client code. */
export type Role = 'admin' | 'manager' | 'editor' | 'viewer';
export type DataSource = 'demo' | 'manual' | 'import';
export type GeoStatus = 'demo' | 'verified' | 'unverified' | 'missing';
export type Polygon = { type: 'Polygon'; coordinates: number[][][] };
export type UnitStatus = 'occupied' | 'vacant' | 'owner_occupied' | 'unavailable';

export interface BuildingSummary {
  id: string;
  name: string;
  heightM: number | null;
  footprint: Polygon | null;
}
export interface PropertySummary {
  id: string;
  code: string;
  name: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geoStatus: GeoStatus;
  footprint: Polygon | null;
  managementType: 'rental' | 'weg' | 'mixed';
  source: DataSource;
  note: string;
  revision: number;
  unitCount: number;
  vacantUnitCount: number;
  openTaskCount: number;
  buildings: BuildingSummary[];
}
export interface UnitDto {
  id: string;
  propertyId: string;
  buildingId: string;
  floorId: string;
  code: string;
  label: string;
  usage: 'residential' | 'commercial' | 'parking';
  status: UnitStatus;
  areaM2: number | null;
  rooms: number | null;
  note: string;
  revision: number;
  source: DataSource;
  createdAt: string;
  updatedAt: string;
}
export interface FloorDto {
  id: string;
  name: string;
  level: number;
  entranceId: string | null;
  units: UnitDto[];
}
export interface BuildingDetail extends BuildingSummary {
  entrances: { id: string; name: string }[];
  floors: FloorDto[];
}
export interface AuditDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  actorName: string;
  createdAt: string;
}
export interface DocumentDto {
  id: string;
  propertyId: string;
  unitId: string | null;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'floorplan' | 'document';
  version: number;
  createdAt: string;
  downloadUrl: string;
}
export interface TaskDto {
  id: string;
  propertyId: string;
  unitId: string | null;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
  dueDate: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface PortfolioResponse {
  properties: PropertySummary[];
  organization: { id: string; name: string };
  membership: { role: Role };
  user: { id: string; name: string; email: string };
}
export interface PropertyResponse {
  property: PropertySummary;
  buildings: BuildingDetail[];
  audit: AuditDto[];
}
export interface UnitResponse {
  unit: UnitDto;
  property: PropertySummary;
  parties: { id: string; name: string; role: string; source: DataSource }[];
  documents: DocumentDto[];
  tasks: TaskDto[];
  audit: AuditDto[];
}
export interface ApiErrorResponse {
  error: { code: string; message: string; issues?: unknown };
}
