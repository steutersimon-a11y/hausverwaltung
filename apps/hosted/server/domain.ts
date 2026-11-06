import { z } from 'zod';
import { ApiError } from './http';
import type { AppState, HostedDocument, HostedProperty, HostedUnit } from './types';

export const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9:_-]+$/);
const nullableText = z.string().trim().min(1).max(300).nullable();
const polygon = z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number().finite()).length(2)).min(4).max(500)).min(1).max(50) });
const reportedCount = z.number().int().nonnegative().max(100000).nullable().default(null);
const floorSchema = z.object({ id, name: z.string().min(1).max(160), level: z.number().int().min(-20).max(200), entranceId: id.nullable().default(null), units: z.array(z.never()).default([]) }).strict();
export const buildingSchema = z.object({ id, name: z.string().min(1).max(160), heightM: z.number().finite().positive().max(1000).nullable(), footprint: polygon.nullable(), entrances: z.array(z.object({ id, name: z.string().max(160) })).max(100), floors: z.array(floorSchema).max(300) }).strict();
export const propertySchema = z.object({ id, code: z.string().min(1).max(80), name: z.string().min(1).max(240), street: nullableText, houseNumber: nullableText, postalCode: nullableText, city: nullableText,
  latitude: z.number().finite().min(-90).max(90).nullable(), longitude: z.number().finite().min(-180).max(180).nullable(), geoStatus: z.enum(['demo','verified','unverified','missing']), footprint: polygon.nullable(),
  managementType: z.enum(['rental','weg','mixed']).nullable(), source: z.enum(['demo','manual','import']), note: z.string().max(10000).default(''), revision: z.number().int().positive().default(1),
  reportedTotalUnits: reportedCount, reportedResidentialUnits: reportedCount, reportedParkingUnits: reportedCount, buildings: z.array(buildingSchema).max(100),
  sourceRecordId: z.string().max(200).nullable().optional(), sourceSystem: z.string().max(100).nullable().optional(), sourceLine: z.number().int().positive().nullable().optional(), sourceLabel: z.string().max(2000).nullable().optional(),
}).strict().superRefine((p,c) => {
  if ((p.latitude === null) !== (p.longitude === null)) c.addIssue({code:'custom',message:'Koordinaten müssen zusammen angegeben werden.'});
  if (p.geoStatus === 'verified' && p.latitude === null) c.addIssue({code:'custom',message:'Verifizierte Koordinaten fehlen.'});
});
export const createUnitSchema = z.object({ propertyId: id, buildingId: id.nullable().optional(), floorId: id.nullable().optional(), code: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(160), usage: z.enum(['residential','commercial','parking']), status: z.enum(['occupied','vacant','owner_occupied','unavailable','unknown']).default('unknown'), areaM2: z.number().finite().positive().max(1000000).nullable().default(null), rooms: z.number().finite().positive().max(100).nullable().default(null), note: z.string().max(10000).default('') }).strict();
export const updateUnitSchema = z.object({label:createUnitSchema.shape.label.optional(),status:createUnitSchema.shape.status.removeDefault().optional(),areaM2:createUnitSchema.shape.areaM2.removeDefault().optional(),rooms:createUnitSchema.shape.rooms.removeDefault().optional(),note:createUnitSchema.shape.note.removeDefault().optional(),revision:z.number().int().positive()}).strict();
export const taskSchema = z.object({propertyId:id,unitId:id.nullable().optional(),title:z.string().trim().min(1).max(180),description:z.string().max(10000).default(''),priority:z.enum(['low','normal','high']).default('normal'),dueDate:z.iso.date().nullable().optional()}).strict();
export const taskPatchSchema = z.object({title:taskSchema.shape.title.optional(),description:taskSchema.shape.description.removeDefault().optional(),priority:taskSchema.shape.priority.removeDefault().optional(),dueDate:taskSchema.shape.dueDate,status:z.enum(['open','in_progress','done']).optional(),revision:z.number().int().positive()}).strict();
export const partySchema = z.object({ name:z.string().trim().min(1).max(240),role:z.enum(['tenant','owner','other']) }).strict();
export const partyPatchSchema = partySchema.partial().extend({ revision:z.number().int().positive() }).strict();
export const archiveSchema = z.object({revision:z.number().int().positive()}).strict();
export function parse<T>(schema: z.ZodType<T>, value: unknown): T { const p=schema.safeParse(value); if (!p.success) throw new ApiError('VALIDATION',422,p.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).slice(0,8).join('; ')); return p.data; }
export function requireProperty(state:AppState,id:string):HostedProperty { const p=state.properties.find(p=>p.id===id&&!p.archivedAt); if(!p)throw new ApiError('NOT_FOUND',404,'Objekt nicht gefunden.'); return p; }
export function requireUnit(state:AppState,id:string,includeArchived=false):HostedUnit { const u=state.units.find(u=>u.id===id&&(includeArchived||!u.archivedAt)); if(!u)throw new ApiError('NOT_FOUND',404,'Einheit nicht gefunden.'); requireProperty(state,u.propertyId); return u; }
export const virtualBuilding=(id:string)=>`unassigned-building:${id}`;
export const virtualFloor=(id:string)=>`unassigned-floor:${id}`;
export function checkHierarchy(p:HostedProperty,buildingId:string|null|undefined,floorId:string|null|undefined):{buildingId:string|null;floorId:string|null} {
  if ((!buildingId||buildingId===virtualBuilding(p.id))&&(!floorId||floorId===virtualFloor(p.id))) return {buildingId:null,floorId:null};
  const building=p.buildings.find(b=>b.id===buildingId);
  if(building&&(!floorId||floorId===virtualFloor(building.id)))return {buildingId:building.id,floorId:null};
  if(!building||!building.floors.some(f=>f.id===floorId)) throw new ApiError('INVALID_HIERARCHY',422,'Gebäude und Geschoss gehören nicht zum gewählten Objekt.'); return {buildingId:building.id,floorId:floorId!};
}
export function unitDto(u:HostedUnit) { const {archivedAt,...dto}=u; void archivedAt; return {...dto,buildingId:u.buildingId??virtualBuilding(u.propertyId),floorId:u.floorId??virtualFloor(u.buildingId??u.propertyId)}; }
export function propertyDto(s:AppState,p:HostedProperty) { const model=s.models.find(m=>m.propertyId===p.id); return {...p,buildings:p.buildings.map(b=>({id:b.id,name:b.name,heightM:b.heightM,footprint:b.footprint})),unitCount:s.units.filter(u=>u.propertyId===p.id&&!u.archivedAt).length,vacantUnitCount:s.units.filter(u=>u.propertyId===p.id&&!u.archivedAt&&u.status==='vacant').length,openTaskCount:s.tasks.filter(t=>t.propertyId===p.id&&!t.archivedAt&&t.status!=='done').length,modelUrl:model?`/api/atlas/models/${encodeURIComponent(p.id)}/content?version=${model.version}`:null}; }
export function buildingDetails(s:AppState,p:HostedProperty) { const buildings=p.buildings.map(b=>{const floors=b.floors.map(f=>({...f,units:s.units.filter(u=>u.propertyId===p.id&&u.buildingId===b.id&&u.floorId===f.id&&!u.archivedAt).map(unitDto)}));const unassigned=s.units.filter(u=>u.propertyId===p.id&&u.buildingId===b.id&&!u.floorId&&!u.archivedAt).map(unitDto);if(!floors.length||unassigned.length)floors.push({id:virtualFloor(b.id),name:'Geschoss offen',level:0,entranceId:null,units:unassigned});return{...b,floors};});
  buildings.push({id:virtualBuilding(p.id),name:'Zuordnung offen',heightM:null,footprint:null,entrances:[],floors:[{id:virtualFloor(p.id),name:'Geschoss offen',level:0,entranceId:null,units:s.units.filter(u=>u.propertyId===p.id&&!u.buildingId&&!u.archivedAt).map(unitDto)}]}); return buildings; }
export function documentDto(d:HostedDocument) { const {versions,...dto}=d; void versions; return {...dto,downloadUrl:`/api/atlas/documents/${encodeURIComponent(d.id)}/content`}; }
export function checkRevision(actual:number,expected:number):void { if(actual!==expected)throw new ApiError('REVISION_CONFLICT',409,'Die Daten wurden inzwischen geändert. Bitte neu laden.'); }
