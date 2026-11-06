import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import type { Footprint } from '../packages/db/src/schema';

try { process.loadEnvFile?.(); } catch { /* CI and Docker pass environment directly. */ }
const {
  account, auditEvents, bootstrapMeta, buildings, db, entrances, floors, memberships,
  organizations, parties, properties, propertyGrants, sqlClient, tasks, unitParties, units, user,
} = await import('../packages/db/src/index');

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Demo-Seeding ist in Produktion gesperrt. Verwende eine isolierte lokale Datenbank.');
}

const uid = (prefix: string, value: number) => `${prefix}-0000-4000-8000-${String(value).padStart(12,'0')}`;
const orgId = uid('10000000',1);
const otherOrgId = uid('10000000',2);
const password = 'Atlas-Demo-2026!';
const demoUsers = [
  { id:'atlas-demo-admin', name:'Demo Administration', email:'admin@atlas.example' },
  { id:'atlas-demo-editor', name:'Demo Sachbearbeitung', email:'editor@atlas.example' },
  { id:'atlas-demo-readonly', name:'Demo Lesezugriff', email:'readonly@atlas.example' },
  { id:'atlas-demo-external', name:'Demo Fremdverwaltung', email:'extern@atlas.example' },
];
const adminId = demoUsers[0]!.id;

function rectangle(lon: number, lat: number, width = 0.00024, depth = 0.00013): Footprint {
  return { type:'Polygon', coordinates:[[
    [lon-width/2,lat-depth/2], [lon+width/2,lat-depth/2],
    [lon+width/2,lat+depth/2], [lon-width/2,lat+depth/2], [lon-width/2,lat-depth/2],
  ]] };
}

try {
  const [done] = await db.select().from(bootstrapMeta).where(eq(bootstrapMeta.key,'synthetic-demo-v1'));
  if (done) {
    console.info('Synthetische Demo ist bereits vorhanden; bestehende Daten bleiben unverändert.');
  } else {
    const hashed = await hashPassword(password);
    await db.transaction(async tx => {
      for (const demoUser of demoUsers) {
        const [existing] = await tx.select().from(user).where(eq(user.email,demoUser.email));
        if (existing && existing.id !== demoUser.id) throw new Error(`Demo-E-Mail ${demoUser.email} gehört bereits zu einer anderen Identität. Seed abgebrochen.`);
        await tx.insert(user).values({ ...demoUser,emailVerified:true }).onConflictDoNothing();
        await tx.insert(account).values({
          id:`${demoUser.id}-credential`, accountId:demoUser.id, providerId:'credential', userId:demoUser.id, password:hashed,
        }).onConflictDoNothing();
      }
      await tx.insert(organizations).values([
        { id:orgId,name:'ATLAS Demo-Verwaltung · ausschließlich fiktiv',source:'demo' },
        { id:otherOrgId,name:'Zweite Demo-Verwaltung · Zugriffstest',source:'demo' },
      ]).onConflictDoNothing();
      await tx.insert(memberships).values([
        { organizationId:orgId,userId:adminId,role:'admin' },
        { organizationId:orgId,userId:demoUsers[1]!.id,role:'editor' },
        { organizationId:orgId,userId:demoUsers[2]!.id,role:'viewer' },
        { organizationId:otherOrgId,userId:demoUsers[3]!.id,role:'viewer' },
      ]).onConflictDoNothing();

      const propertyDefinitions = [
        { name:'Hafenhof · Demo',street:'Musterkai',houseNumber:'12',lon:6.7371,lat:51.5658,managementType:'rental' as const },
        { name:'Lindenquartier · Demo',street:'Beispielallee',houseNumber:'8',lon:6.7318,lat:51.5633,managementType:'weg' as const },
        { name:'Parkensemble · Demo',street:'Modellgarten',houseNumber:'4',lon:6.7422,lat:51.5610,managementType:'mixed' as const },
      ];
      let buildingCount=0, floorCount=0, unitCount=0, partyCount=0;
      for (const [propertyIndex, definition] of propertyDefinitions.entries()) {
        const propertyId=uid('20000000',propertyIndex+1);
        await tx.insert(properties).values({
          id:propertyId,organizationId:orgId,code:`DEMO-${String(propertyIndex+1).padStart(3,'0')}`,
          name:definition.name,street:definition.street,houseNumber:definition.houseNumber,
          postalCode:'00000',city:'Demostadt (fiktiv)',latitude:String(definition.lat),longitude:String(definition.lon),
          geoStatus:'demo',footprint:rectangle(definition.lon+0.00015,definition.lat,0.00063,0.00024),
          managementType:definition.managementType,source:'demo',sourceSystem:'atlas-synthetic-v1',sourceRecordId:`property-${propertyIndex+1}`,
          note:'Vollständig synthetischer Datensatz. Kartenposition, Gebäudegeometrie, Adresse und Einheiten sind für diesen Prototyp konstruiert und zeigen keinen echten Verwaltungsbestand.',
        }).onConflictDoNothing();
        for (let buildingIndex=0;buildingIndex<2;buildingIndex++) {
          const buildingId=uid('30000000',++buildingCount);
          const entranceId=uid('50000000',buildingCount);
          const footprint=rectangle(definition.lon+buildingIndex*0.00035,definition.lat);
          await tx.insert(buildings).values({
            id:buildingId,organizationId:orgId,propertyId,name:`Haus ${buildingIndex===0?'A':'B'} · Demo`,
            heightM:'9.400',footprint,source:'demo',
          }).onConflictDoNothing();
          await tx.insert(entrances).values({ id:entranceId,organizationId:orgId,propertyId,buildingId,name:'Aufgang 1 · Demo' }).onConflictDoNothing();
          for (let level=0;level<3;level++) {
            const floorId=uid('40000000',++floorCount);
            await tx.insert(floors).values({ id:floorId,organizationId:orgId,propertyId,buildingId,entranceId,name:level===0?'Erdgeschoss':`${level}. Obergeschoss`,level }).onConflictDoNothing();
            for (let side=0;side<2;side++) {
              const unitNumber=++unitCount, unitId=uid('60000000',unitNumber);
              const vacant=unitNumber%7===0;
              await tx.insert(units).values({
                id:unitId,organizationId:orgId,propertyId,buildingId,floorId,
                code:`DEMO-${propertyIndex+1}-${buildingIndex+1}-${level}-${side+1}`,
                label:`Wohnung ${side===0?'links':'rechts'} · Demo`,usage:'residential',status:vacant?'vacant':'occupied',
                areaM2:(58.5+side*8+level*3+propertyIndex*5).toFixed(2),rooms:side===0?'2.5':'3.0',
                note:'Synthetische Beispieldaten für Bearbeitung und Audit-Historie.',source:'demo',
              }).onConflictDoNothing();
              if (!vacant) {
                const partyId=uid('70000000',++partyCount);
                await tx.insert(parties).values({ id:partyId,organizationId:orgId,name:`Demo-Partei ${String(partyCount).padStart(2,'0')} (fiktiv)`,kind:'person',source:'demo' }).onConflictDoNothing();
                await tx.insert(unitParties).values({ id:uid('80000000',partyCount),organizationId:orgId,propertyId,unitId,partyId,role:'tenant',validFrom:'2026-01-01' }).onConflictDoNothing();
              }
              if (unitNumber===1) {
                const partyId=uid('70000000',++partyCount);
                await tx.insert(parties).values({ id:partyId,organizationId:orgId,name:'Demo-Mitpartei (fiktiv)',kind:'person',source:'demo' }).onConflictDoNothing();
                await tx.insert(unitParties).values({ id:uid('80000000',partyCount),organizationId:orgId,propertyId,unitId,partyId,role:'co_tenant',validFrom:'2026-01-01' }).onConflictDoNothing();
              }
            }
          }
        }
        await tx.insert(tasks).values({
          id:uid('90000000',propertyIndex+1),organizationId:orgId,propertyId,
          title:['Wartungsprotokoll prüfen · Demo','Grundriss ergänzen · Demo','Leerstandsbegehung planen · Demo'][propertyIndex]!,
          description:'Fiktive Aufgabe zur Demonstration des nachvollziehbaren Verwaltungsablaufs.',
          status:propertyIndex===1?'in_progress':'open',priority:propertyIndex===0?'high':'normal',
          dueDate:'2026-11-20',createdBy:adminId,
        }).onConflictDoNothing();
        await tx.insert(auditEvents).values({
          id:uid('a0000000',propertyIndex+1),organizationId:orgId,propertyId,actorId:adminId,
          action:'demo.seeded',entityType:'property',entityId:propertyId,
          before:null,after:{ source:'demo',code:`DEMO-${String(propertyIndex+1).padStart(3,'0')}`,synthetic:true },
        }).onConflictDoNothing();
      }
      await tx.insert(properties).values([
        { id:uid('20000000',4),organizationId:orgId,code:'DEMO-REVIEW',name:'Unvollständiger Import · Demo',geoStatus:'missing',managementType:'rental',source:'demo',note:'Absichtlich keine Adresse, Koordinaten oder Geometrie. In der Liste zur Klärung, nicht auf der Karte.' },
        { id:uid('20000000',5),organizationId:otherOrgId,code:'OTHER-001',name:'Fremder Demo-Bestand · Zugriffstest',geoStatus:'missing',managementType:'rental',source:'demo',note:'Nur für den automatisierten Mandantentrennungstest.' },
      ]).onConflictDoNothing();
      await tx.insert(propertyGrants).values([
        { organizationId:orgId,propertyId:uid('20000000',1),userId:demoUsers[1]!.id,canEdit:true },
        { organizationId:orgId,propertyId:uid('20000000',1),userId:demoUsers[2]!.id,canEdit:false },
        { organizationId:otherOrgId,propertyId:uid('20000000',5),userId:demoUsers[3]!.id,canEdit:false },
      ]).onConflictDoNothing();
      await tx.insert(bootstrapMeta).values({
        key:'synthetic-demo-v1',value:{ synthetic:true,organizationId:orgId,propertyCount:4,buildingCount,floorCount,unitCount,otherOrganizationId:otherOrgId },
      });
    });
    console.info('Synthetische Demo angelegt: 4 Objekte, davon 3 mit Demo-Geometrie; 6 Gebäude, 18 Geschosse, 36 Einheiten.');
    console.info('Demo-Anmeldung: admin@atlas.example / Atlas-Demo-2026! (nur isolierte Entwicklung).');
  }
} finally {
  await sqlClient.end();
}
