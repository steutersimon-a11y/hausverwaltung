import type { AuditDto, BuildingDetail, DocumentDto, PropertySummary, TaskDto, UnitDto } from '../../../packages/db/src/contracts';

export interface D1Result { success: boolean; meta: { changes?: number }; }
export interface D1Statement { bind(...values: unknown[]): D1Statement; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<D1Result>; }
export interface D1Database { prepare(query: string): D1Statement; exec(query: string): Promise<unknown>; }
export interface BucketObject { body: ReadableStream<Uint8Array>; size: number; httpMetadata?: { contentType?: string }; }
export interface R2Bucket { put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; get(key: string): Promise<BucketObject | null>; delete?(key: string): Promise<void>; }
export interface Env { DB: D1Database; BUCKET: R2Bucket; ATLAS_SERVICE_SECRET?: string; }
export interface Actor { id: string; name: string; email: string; service?: true; }
export interface HostedProperty extends Omit<PropertySummary, 'buildings' | 'unitCount' | 'vacantUnitCount' | 'openTaskCount' | 'managementType'> {
  managementType: 'rental' | 'weg' | 'mixed' | null;
  reportedTotalUnits: number | null;
  reportedResidentialUnits: number | null;
  reportedParkingUnits: number | null;
  buildings: BuildingDetail[];
  sourceRecordId?: string | null;
  sourceSystem?: string | null;
  sourceLine?: number | null;
  sourceLabel?: string | null;
  archivedAt?: string | null;
}
export interface HostedUnit extends Omit<UnitDto, 'buildingId' | 'floorId' | 'status'> { buildingId: string | null; floorId: string | null; status: UnitDto['status'] | 'unknown'; archivedAt?: string | null; }
export interface HostedParty { id: string; unitId: string; propertyId: string; name: string; role: 'tenant' | 'owner' | 'other'; source: 'manual' | 'import'; revision: number; createdAt: string; updatedAt: string; }
export interface HostedTask extends TaskDto { archivedAt?: string | null; }
export interface StoredVersion { version: number; storageKey: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string; }
export interface HostedDocument extends Omit<DocumentDto, 'downloadUrl'> { versions: StoredVersion[]; }
export interface HostedModel { id: string; propertyId: string; storageKey: string; originalName: string; sizeBytes: number; version: number; createdAt: string; versions: StoredVersion[]; }
export interface HostedAudit extends AuditDto { propertyId: string | null; unitId: string | null; actorId: string; }
export interface AppState { schemaVersion: 1; organization: { id: string; name: string }; properties: HostedProperty[]; units: HostedUnit[]; parties: HostedParty[]; tasks: HostedTask[]; documents: HostedDocument[]; models: HostedModel[]; audit: HostedAudit[]; imports: unknown[]; }
