/** Browser-only transport types; all values originate from the private API. */
import type { AuditDto, DocumentDto, PropertySummary as BaseProperty, UnitDto as BaseUnit, TaskDto } from '../../../packages/db/src/contracts';
export type { AuditDto, DocumentDto, TaskDto } from '../../../packages/db/src/contracts';
export interface PropertySummary extends Omit<BaseProperty, 'managementType'> {
  managementType: BaseProperty['managementType'] | null;
  reportedTotalUnits: number | null;
  reportedResidentialUnits: number | null;
  reportedParkingUnits: number | null;
  sourceLabel?: string | null;
  modelUrl?: string | null;
}
export type UnitStatus = BaseUnit['status'] | 'unknown';
export interface UnitDto extends Omit<BaseUnit, 'buildingId' | 'floorId' | 'status'> { buildingId: string | null; floorId: string | null; status: UnitStatus; }
export interface BuildingDetail { id: string; name: string; heightM: number | null; footprint: BaseProperty['footprint']; entrances: {id:string;name:string}[]; floors: {id:string;name:string;level:number|null;entranceId:string|null;units:UnitDto[]}[]; }
export interface PartyDto {id:string;name:string;role:'tenant'|'owner'|'other';source:'manual'|'import'|'demo';revision:number;}
export interface PortfolioResponse {properties:PropertySummary[]; organization:{id:string;name:string}; membership:{role:'admin'|'manager'|'editor'|'viewer'};user:{id:string;name:string;email:string};}
export interface PropertyResponse {property:PropertySummary;buildings:BuildingDetail[];audit:AuditDto[];}
export interface UnitResponse {unit:UnitDto;property:PropertySummary;parties:PartyDto[];documents:DocumentDto[];tasks:TaskDto[];audit:AuditDto[];}
