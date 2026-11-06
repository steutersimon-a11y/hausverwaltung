import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sqlClient } from '../../packages/db/src/index';

type Tx = Parameters<Parameters<typeof sqlClient.begin>[1]>[0];
class RollBackFixture extends Error {}
async function fixture(test: (tx: Tx, ids: {orgA:string;orgB:string;userId:string;propertyA:string;propertyB:string;buildingA:string;buildingB:string;floorA:string;floorB:string;unitA:string}) => Promise<void>) {
  try {
    await sqlClient.begin(async tx => {
      const ids={orgA:randomUUID(),orgB:randomUUID(),userId:randomUUID(),propertyA:randomUUID(),propertyB:randomUUID(),buildingA:randomUUID(),buildingB:randomUUID(),floorA:randomUUID(),floorB:randomUUID(),unitA:randomUUID()};
      await tx`insert into organizations(id,name,source) values(${ids.orgA},'Invariant fixture A','demo'),(${ids.orgB},'Invariant fixture B','demo')`;
      await tx`insert into auth_user(id,name,email) values(${ids.userId},'Synthetic invariant actor',${`${ids.userId}@example.test`})`;
      await tx`insert into memberships(organization_id,user_id,role) values(${ids.orgA},${ids.userId},'admin')`;
      await tx`insert into properties(id,organization_id,code,name,source) values(${ids.propertyA},${ids.orgA},'TEST-A','Synthetic A','demo'),(${ids.propertyB},${ids.orgA},'TEST-B','Synthetic B','demo')`;
      await tx`insert into buildings(id,organization_id,property_id,name,source) values(${ids.buildingA},${ids.orgA},${ids.propertyA},'Synthetic A','demo'),(${ids.buildingB},${ids.orgA},${ids.propertyB},'Synthetic B','demo')`;
      await tx`insert into floors(id,organization_id,property_id,building_id,name,level) values(${ids.floorA},${ids.orgA},${ids.propertyA},${ids.buildingA},'Ground',0),(${ids.floorB},${ids.orgA},${ids.propertyB},${ids.buildingB},'Ground',0)`;
      await tx`insert into units(id,organization_id,property_id,building_id,floor_id,code,label,source) values(${ids.unitA},${ids.orgA},${ids.propertyA},${ids.buildingA},${ids.floorA},'UNIT-A','Synthetic unit','demo')`;
      await test(tx,ids);
      throw new RollBackFixture();
    });
  } catch (error) {
    if (!(error instanceof RollBackFixture)) throw error;
  }
}

describe('database-enforced invariants', () => {
  it('rejects a property grant crossing tenant boundaries', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`insert into property_grants(organization_id,property_id,user_id) values(${ids.orgB},${ids.propertyA},${ids.userId})`).rejects.toMatchObject({code:'23503'});
    });
  });
  it('rejects a unit linked to another property floor', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`insert into units(organization_id,property_id,building_id,floor_id,code,label) values(${ids.orgA},${ids.propertyA},${ids.buildingA},${ids.floorB},'CROSS','Invalid unit')`).rejects.toMatchObject({code:'23503'});
    });
  });
  it('rejects a document linked to a unit of another property', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`insert into documents(organization_id,property_id,unit_id,title,original_name,mime_type,size_bytes,created_by) values(${ids.orgA},${ids.propertyB},${ids.unitA},'Synthetic','plan.png','image/png',10,${ids.userId})`).rejects.toMatchObject({code:'23503'});
    });
  });
  it('rejects negative unit areas', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`update units set area_m2=-1 where id=${ids.unitA}`).rejects.toMatchObject({code:'23514'});
    });
  });
  it('rejects invalid revisions', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`update units set revision=0 where id=${ids.unitA}`).rejects.toMatchObject({code:'23514'});
    });
  });
  it('rejects verified coordinates without a location', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`update properties set geo_status='verified' where id=${ids.propertyA}`).rejects.toMatchObject({code:'23514'});
    });
  });
  it('rejects out-of-range geographic coordinates', async () => {
    await fixture(async(tx,ids)=>{
      await expect(tx`update properties set latitude=100,longitude=6,geo_status='unverified' where id=${ids.propertyA}`).rejects.toMatchObject({code:'23514'});
    });
  });
  it('stores a generated WGS84 point and a geographic index', async () => {
    await fixture(async(tx,ids)=>{
      await tx`update properties set latitude=51.5,longitude=6.7,geo_status='demo' where id=${ids.propertyA}`;
      const [point]=await tx`select ST_SRID(location) as srid,ST_X(location) as longitude,ST_Y(location) as latitude from properties where id=${ids.propertyA}`;
      expect(point).toMatchObject({srid:4326,longitude:6.7,latitude:51.5});
      const [spatialIndex]=await tx`select indexdef from pg_indexes where indexname='properties_location_gist'`;
      expect(spatialIndex?.indexdef).toContain('USING gist');
    });
  });
  it('prevents editing an appended audit event', async () => {
    await fixture(async(tx,ids)=>{
      const auditId=randomUUID();
      await tx`insert into audit_events(id,organization_id,property_id,actor_id,action,entity_type,entity_id) values(${auditId},${ids.orgA},${ids.propertyA},${ids.userId},'test.created','property',${ids.propertyA})`;
      await expect(tx`update audit_events set action='concealed' where id=${auditId}`).rejects.toMatchObject({code:'P0001'});
    });
  });
  it('prevents deleting an appended audit event', async () => {
    await fixture(async(tx,ids)=>{
      const auditId=randomUUID();
      await tx`insert into audit_events(id,organization_id,property_id,actor_id,action,entity_type,entity_id) values(${auditId},${ids.orgA},${ids.propertyA},${ids.userId},'test.created','property',${ids.propertyA})`;
      await expect(tx`delete from audit_events where id=${auditId}`).rejects.toMatchObject({code:'P0001'});
    });
  });
});
afterAll(async()=>{await sqlClient.end();});
