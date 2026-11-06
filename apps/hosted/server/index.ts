import { z } from 'zod';
import { ApiError, json, readJson } from './http';
import { appendAudit, loadState, updateState } from './store';
import { archiveSchema, buildingDetails, checkHierarchy, checkRevision, createUnitSchema, documentDto, parse, partyPatchSchema, partySchema, propertyDto, propertySchema, requireProperty, requireUnit, taskPatchSchema, taskSchema, unitDto, updateUnitSchema } from './domain';
import { handleFiles } from './files';
import { handleImports } from './imports';
import type { Actor, Env, HostedProperty, HostedUnit } from './types';
export type { Env } from './types';

function headerText(value:string|null,fallback:string):string { if(!value)return fallback; try{return decodeURIComponent(value).slice(0,240);}catch{return value.slice(0,240);} }
export function requestActor(request:Request,env:Env):Actor {
  const identity=request.headers.get('oai-authenticated-user-id');
  if(identity) return {id:identity.slice(0,200),name:headerText(request.headers.get('oai-authenticated-user-full-name')??request.headers.get('oai-authenticated-user-name'),'Verwaltung'),email:headerText(request.headers.get('oai-authenticated-user-email'),'')};
  const actual=request.headers.get('X-Atlas-Service-Authorization')??'';
  const expected=env.ATLAS_SERVICE_SECRET&&env.ATLAS_SERVICE_SECRET.length>=32?`Bearer ${env.ATLAS_SERVICE_SECRET}`:'';
  let difference=actual.length^expected.length; for(let i=0;i<Math.max(actual.length,expected.length);i++)difference|=(actual.charCodeAt(i)||0)^(expected.charCodeAt(i)||0);
  if(!expected||difference!==0)throw new ApiError('UNAUTHENTICATED',401,'Bitte über den privaten Website-Zugang anmelden.');
  return {id:'service-admin',name:'Geschützter Datenimport',email:'',service:true};
}
function checkMutation(request:Request,actor:Actor):void {
  if(['GET','HEAD','OPTIONS'].includes(request.method))return;
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError('INVALID_ORIGIN',403,'Die Anfrage stammt nicht von dieser Website.');
  const origin=request.headers.get('origin');
  if(origin!==null&&origin!==new URL(request.url).origin)throw new ApiError('INVALID_ORIGIN',403,'Die Anfrage stammt nicht von dieser Website.');
  if(!actor.service&&!origin)throw new ApiError('MISSING_ORIGIN',403,'Die Herkunft der Anfrage fehlt.');
}
const now=()=>new Date().toISOString();
const methodError=()=>{throw new ApiError('METHOD_NOT_ALLOWED',405,'Diese Aktion ist hier nicht verfügbar.');};

export async function handleApi(request:Request,env:Env):Promise<Response|null> {
  const url=new URL(request.url); const path=url.pathname;
  if(!path.startsWith('/api/'))return null;
  try {
    const actor=requestActor(request,env); checkMutation(request,actor);
    if(path==='/api/auth/get-session'&&request.method==='GET')return json({user:actor,session:{id:'private-workspace',userId:actor.id,expiresAt:new Date(Date.now()+3600000).toISOString()}});
    const fileResponse=await handleFiles(request,url,env,actor); if(fileResponse)return fileResponse;
    const importResponse=await handleImports(request,url,env,actor); if(importResponse)return importResponse;
    if(path==='/api/atlas/bootstrap') {
      if(!['PUT','POST'].includes(request.method))return methodError();
      if(!actor.service)throw new ApiError('FORBIDDEN',403,'Der Erstimport ist nur über den geschützten Importzugang möglich.');
      const input=parse(z.object({properties:z.array(propertySchema).max(1000)}).strict(),await readJson(request));
      const ids=new Set<string>(),codes=new Set<string>(),hierarchyIds=new Set<string>();
      for(const p of input.properties) {if(ids.has(p.id)||codes.has(p.code))throw new ApiError('DUPLICATE_PROPERTY',422,'Objekt-ID oder Objektcode doppelt.'); ids.add(p.id);codes.add(p.code);
        for(const b of p.buildings){if(hierarchyIds.has(b.id))throw new ApiError('DUPLICATE_BUILDING',422,'Gebäude-ID doppelt.');hierarchyIds.add(b.id);for(const f of b.floors){if(hierarchyIds.has(f.id))throw new ApiError('DUPLICATE_FLOOR',422,'Geschoss-ID doppelt.');hierarchyIds.add(f.id);if(f.entranceId&&!b.entrances.some(e=>e.id===f.entranceId))throw new ApiError('INVALID_HIERARCHY',422,'Der Eingang gehört nicht zum Gebäude.');}}
      }
      const result=await updateState(env,s=>{if(s.properties.length){
        const existing=s.properties.map(p=>({...p,revision:1}));
        if(JSON.stringify(existing)===JSON.stringify(input.properties))return {imported:false,propertyCount:s.properties.length};
        throw new ApiError('BOOTSTRAP_NOT_EMPTY',409,'Es sind bereits Daten vorhanden. Der Erstimport überschreibt keine bestehenden Einträge.');}
        if(s.units.length||s.tasks.length||s.documents.length||s.models.length||s.parties.length)throw new ApiError('BOOTSTRAP_NOT_EMPTY',409,'Der Datenbestand ist nicht leer.');
        s.properties=input.properties as HostedProperty[]; appendAudit(s,actor,'workspace.bootstrapped','workspace',s.organization.id,null,{propertyCount:s.properties.length}); return {imported:true,propertyCount:s.properties.length};});
      return json(result, result.imported?201:200);
    }
    if(path==='/api/atlas/portfolio'&&request.method==='GET'){const {state:s}=await loadState(env);return json({organization:s.organization,membership:{role:'admin'},user:actor,properties:s.properties.filter(p=>!p.archivedAt).map(p=>propertyDto(s,p))});}
    if(path==='/api/atlas/properties'&&request.method==='POST') {
      const raw=await readJson(request); const base=parse(propertySchema,{...(typeof raw==='object'&&raw!==null?raw:{}),id:crypto.randomUUID(),revision:1,source:'manual',reportedTotalUnits:null,reportedResidentialUnits:null,reportedParkingUnits:null,buildings:[]});
      return json(await updateState(env,s=>{if(s.properties.some(p=>p.code===base.code))throw new ApiError('DUPLICATE_CODE',409,'Der Objektcode ist bereits vergeben.');s.properties.push(base);appendAudit(s,actor,'property.created','property',base.id,null,base,base.id);return {property:propertyDto(s,base)};}),201);
    }
    let match=path.match(/^\/api\/atlas\/properties\/([^/]+)$/);
    if(match){const propertyId=decodeURIComponent(match[1]!);
      if(request.method==='GET'){const {state:s}=await loadState(env);const p=requireProperty(s,propertyId);return json({property:propertyDto(s,p),buildings:buildingDetails(s,p),audit:s.audit.filter(a=>a.propertyId===p.id).slice(-200).reverse()});}
      if(request.method==='PATCH'){const fields=z.object({revision:z.number().int().positive(),name:z.string().min(1).max(240).optional(),note:z.string().max(10000).optional(),managementType:z.enum(['rental','weg','mixed']).nullable().optional()}).strict();const input=parse(fields,await readJson(request));return json(await updateState(env,s=>{const p=requireProperty(s,propertyId);checkRevision(p.revision,input.revision);const before=structuredClone(p);Object.assign(p,input,{revision:p.revision+1});appendAudit(s,actor,'property.updated','property',p.id,before,p,p.id);return{property:propertyDto(s,p)};}));}
      return methodError();
    }
    if(path==='/api/atlas/units'&&request.method==='POST') {const input=parse(createUnitSchema,await readJson(request));return json(await updateState(env,s=>{const p=requireProperty(s,input.propertyId);const hierarchy=checkHierarchy(p,input.buildingId,input.floorId);
      if(s.units.some(u=>u.propertyId===p.id&&u.code===input.code&&!u.archivedAt))throw new ApiError('DUPLICATE_CODE',409,'Der Einheitencode ist bereits vergeben.');const time=now();const u:HostedUnit={...input,...hierarchy,id:crypto.randomUUID(),source:'manual',revision:1,createdAt:time,updatedAt:time};s.units.push(u);appendAudit(s,actor,'unit.created','unit',u.id,null,unitDto(u),u.propertyId,u.id);return{unit:unitDto(u)};}),201);}
    match=path.match(/^\/api\/atlas\/units\/([^/]+)$/);
    if(match){const unitId=decodeURIComponent(match[1]!);
      if(request.method==='GET'){const {state:s}=await loadState(env);const u=requireUnit(s,unitId);return json({unit:unitDto(u),property:propertyDto(s,requireProperty(s,u.propertyId)),parties:s.parties.filter(p=>p.unitId===u.id),documents:s.documents.filter(d=>d.unitId===u.id).map(documentDto),tasks:s.tasks.filter(t=>t.unitId===u.id&&!t.archivedAt),audit:s.audit.filter(a=>a.unitId===u.id).slice(-200).reverse()});}
      if(request.method==='PATCH'){const input=parse(updateUnitSchema,await readJson(request));if(Object.keys(input).length<2)throw new ApiError('VALIDATION',422,'Bitte mindestens ein Feld ändern.');return json(await updateState(env,s=>{const u=requireUnit(s,unitId);checkRevision(u.revision,input.revision);const before=unitDto(u);Object.assign(u,input,{revision:u.revision+1,updatedAt:now()});appendAudit(s,actor,'unit.updated','unit',u.id,before,unitDto(u),u.propertyId,u.id);return{unit:unitDto(u)};}));}
      if(request.method==='DELETE'){const input=parse(archiveSchema,await readJson(request));return json(await updateState(env,s=>{const u=requireUnit(s,unitId);checkRevision(u.revision,input.revision);const before=unitDto(u);u.archivedAt=now();u.updatedAt=now();u.revision++;appendAudit(s,actor,'unit.archived','unit',u.id,before,{archivedAt:u.archivedAt,revision:u.revision},u.propertyId,u.id);return{archived:true,id:u.id,revision:u.revision};}));}
      return methodError();
    }
    match=path.match(/^\/api\/atlas\/units\/([^/]+)\/parties$/);
    if(match&&request.method==='POST'){const input=parse(partySchema,await readJson(request));return json(await updateState(env,s=>{const u=requireUnit(s,decodeURIComponent(match![1]!));const time=now();const party={...input,id:crypto.randomUUID(),unitId:u.id,propertyId:u.propertyId,source:'manual' as const,revision:1,createdAt:time,updatedAt:time};s.parties.push(party);appendAudit(s,actor,'party.created','party',party.id,null,party,u.propertyId,u.id);return{party};}),201);}
    match=path.match(/^\/api\/atlas\/parties\/([^/]+)$/);
    if(match&&request.method==='PATCH'){const partyId=decodeURIComponent(match[1]!);const input=parse(partyPatchSchema,await readJson(request));if(Object.keys(input).length<2)throw new ApiError('VALIDATION',422,'Bitte mindestens ein Feld ändern.');return json(await updateState(env,s=>{const p=s.parties.find(p=>p.id===partyId);if(!p)throw new ApiError('NOT_FOUND',404,'Partei nicht gefunden.');requireUnit(s,p.unitId);checkRevision(p.revision,input.revision);const before=structuredClone(p);Object.assign(p,input,{revision:p.revision+1,updatedAt:now()});appendAudit(s,actor,'party.updated','party',p.id,before,p,p.propertyId,p.unitId);return{party:p};}));}
    if(path==='/api/atlas/tasks'){
      if(request.method==='GET'){const{state:s}=await loadState(env);const propertyId=url.searchParams.get('propertyId'),unitId=url.searchParams.get('unitId');if(propertyId)requireProperty(s,propertyId);if(unitId){const u=requireUnit(s,unitId,true);if(propertyId&&u.propertyId!==propertyId)throw new ApiError('NOT_FOUND',404,'Einheit nicht gefunden.');}return json({tasks:s.tasks.filter(t=>!t.archivedAt&&(!propertyId||t.propertyId===propertyId)&&(!unitId||t.unitId===unitId))});}
      if(request.method==='POST'){const input=parse(taskSchema,await readJson(request));return json(await updateState(env,s=>{requireProperty(s,input.propertyId);if(input.unitId&&requireUnit(s,input.unitId).propertyId!==input.propertyId)throw new ApiError('INVALID_HIERARCHY',422,'Die Einheit gehört nicht zum gewählten Objekt.');const time=now(),task={...input,id:crypto.randomUUID(),unitId:input.unitId??null,dueDate:input.dueDate??null,status:'open' as const,revision:1,createdAt:time,updatedAt:time};s.tasks.push(task);appendAudit(s,actor,'task.created','task',task.id,null,task,task.propertyId,task.unitId);return{task};}),201);}
      return methodError();
    }
    match=path.match(/^\/api\/atlas\/tasks\/([^/]+)$/);
    if(match){const taskId=decodeURIComponent(match[1]!);
      if(request.method==='GET'){const{state:s}=await loadState(env);const task=s.tasks.find(t=>t.id===taskId&&!t.archivedAt);if(!task)throw new ApiError('NOT_FOUND',404,'Aufgabe nicht gefunden.');requireProperty(s,task.propertyId);return json({task,audit:s.audit.filter(a=>a.entityType==='task'&&a.entityId===task.id).reverse()});}
      if(request.method==='PATCH'||request.method==='DELETE'){const input=parse(request.method==='PATCH'?taskPatchSchema:archiveSchema,await readJson(request));if(request.method==='PATCH'&&Object.keys(input).length<2)throw new ApiError('VALIDATION',422,'Bitte mindestens ein Feld ändern.');return json(await updateState(env,s=>{const task=s.tasks.find(t=>t.id===taskId&&!t.archivedAt);if(!task)throw new ApiError('NOT_FOUND',404,'Aufgabe nicht gefunden.');requireProperty(s,task.propertyId);checkRevision(task.revision,input.revision);const before=structuredClone(task);Object.assign(task,input,{revision:task.revision+1,updatedAt:now()});if(request.method==='DELETE')task.archivedAt=now();appendAudit(s,actor,request.method==='DELETE'?'task.archived':'task.updated','task',task.id,before,task,task.propertyId,task.unitId);return{task};}));}
      return methodError();
    }
    if(path==='/api/atlas/audit'&&request.method==='GET'){const{state:s}=await loadState(env);const propertyId=url.searchParams.get('propertyId');if(propertyId)requireProperty(s,propertyId);return json({audit:s.audit.filter(a=>!propertyId||a.propertyId===propertyId).slice(-1000).reverse()});}
    throw new ApiError('NOT_FOUND',404,'Diese Funktion wurde nicht gefunden.');
  } catch(error) {
    if(error instanceof ApiError)return json({error:{code:error.code,message:error.message}},error.status);
    console.error('ATLAS_API_ERROR',error instanceof Error?error.name:'UnknownError');
    return json({error:{code:'INTERNAL_ERROR',message:'Die Anfrage konnte nicht abgeschlossen werden. Bitte erneut versuchen.'}},500);
  }
}
