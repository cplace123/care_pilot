import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@/generated/prisma/client';
import { withOrganisation, setContext } from '@/lib/server/access';
import { tenantApi } from '@/lib/server/api';
import { uploadImport, configureImport, processImport, importDetail, importHistory, validationReport } from '@/lib/server/imports';
const url = new URL(process.env.DIRECT_DATABASE_URL ?? '');
if (!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname !== '/carepilot' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Local synthetic database required');
const admin = new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
const runtime = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const a=randomUUID(),b=randomUUID(),sid=randomUUID();let userId:string;
const identity=()=>({userId,sessionId:sid});
const scope=<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>)=>withOrganisation(runtime,identity(),a,'imports.write',work);
const upload=(text:string,type='participants',provider='CSV',filename='synthetic.csv')=>scope(tx=>uploadImport(tx,a,{provider,dataType:type,filename},Buffer.from(text)));
const map=(id:string,columns:string[],extra:Record<string,unknown>={})=>scope(tx=>configureImport(tx,a,id,{mapping:Object.fromEntries(columns.map(c=>[c,c])),dateFormat:'ISO',...extra}));
const step=(id:string)=>scope(async tx=>processImport(tx,a,id,(await importDetail(tx,a,id)).job.configurationToken));
const detail=(id:string)=>scope(tx=>importDetail(tx,a,id));
async function finish(id:string) { let result;do { result=await step(id); } while(result.job.status==='PROCESSING');return result; }
beforeAll(async()=>{
 const seeded=await admin.user.findUniqueOrThrow({where:{email:'auditor@harbour.example'}});
 userId=(await admin.user.create({data:{email:`import-${randomUUID()}@synthetic.example`,name:'Synthetic importer',passwordHash:seeded.passwordHash}})).id;
 await admin.organisation.createMany({data:[{id:a,name:'Synthetic import test'},{id:b,name:'Other synthetic tenant'}]});
 const membership=await admin.organisationMembership.create({data:{organisationId:a,userId}});
 const role=await admin.role.create({data:{organisationId:a,name:'Organisation Owner'}});
 await admin.rolePermission.createMany({data:['imports.read','imports.write','integrations.read'].map(permissionKey=>({organisationId:a,roleId:role.id,permissionKey}))});
 await admin.membershipRole.create({data:{organisationId:a,membershipId:membership.id,roleId:role.id}});
 await admin.authSession.create({data:{id:sid,userId,mfaVerified:true,expiresAt:new Date(Date.now()+3600000)}});
});
afterAll(async()=>{await admin.authSession.deleteMany({where:{id:sid}});await runtime.$disconnect();await admin.$disconnect();});
it('imports CSV, saves mapping templates, records provenance and audits without cell contents',async()=>{
 const {job}=await upload('externalId,displayName\nP1,Synthetic One');
 expect(job.status).toBe('MAPPING_REQUIRED');
 await map(job.id,['externalId','displayName'],{templateName:'Reusable participants'});
 const preview=await detail(job.id);expect(preview.templates).toHaveLength(1);expect(preview.file.checksum).toMatch(/^[a-f0-9]{64}$/);
 const result=await finish(job.id);expect(result.job.successCount).toBe(1);expect(result.job.status).toBe('COMPLETED');
 const events=await admin.activityEvent.findMany({where:{resourceId:job.id}});
 expect(events.some(e=>e.action==='import.completed'&&e.actorId===userId)).toBe(true);
 expect(JSON.stringify(events)).not.toContain('Synthetic One');
 const file=await admin.importFile.findFirstOrThrow({where:{id:job.fileId!}});expect(Buffer.from(file.encryptedContent).includes(Buffer.from('Synthetic One'))).toBe(false);
 expect((await scope(tx=>importHistory(tx,a))).jobs.some(j=>j.id===job.id)).toBe(true);
});
it('imports genuine XLSX rows through the same mapping and processing pipeline',async()=>{
 const {job}=await scope(async tx=>uploadImport(tx,a,{provider:'CSV',dataType:'participants',filename:'participants.xlsx'},await readFile('samples/imports/01-participants.xlsx')));
 await map(job.id,['externalId','displayName']);expect((await finish(job.id)).job.successCount).toBe(2);
});
it('deduplicates simultaneous uploads and repeated imports across different files',async()=>{
 const text='externalId,displayName\nP-DUP,Synthetic Duplicate';
 const [one,two]=await Promise.all([upload(text),upload(text)]);expect(one.job.id).toBe(two.job.id);expect([one.duplicate,two.duplicate].filter(Boolean)).toHaveLength(1);
 await expect(upload(text,'participants','ShiftCare')).rejects.toMatchObject({status:409});
 await expect(upload(text,'participants','CSV','disguised.xlsx')).rejects.toMatchObject({status:409});
 await map(one.job.id,['externalId','displayName']);await finish(one.job.id);
 const other=await upload(text+'\n');await map(other.job.id,['externalId','displayName']);expect((await finish(other.job.id)).job.unchangedCount).toBe(1);
 expect(await admin.sourceRecord.count({where:{organisationId:a,externalId:'P-DUP'}})).toBe(1);
});
it('appends changed versions only with explicit approval and keeps historical snapshots immutable',async()=>{
 const first=await upload('externalId,displayName\nP-V,Original');await map(first.job.id,['externalId','displayName']);await finish(first.job.id);
 const second=await upload('externalId,displayName\nP-V,Changed');
 const rejected=await map(second.job.id,['externalId','displayName']);expect(rejected.summary.conflicting).toBe(1);
 const approved=await map(second.job.id,['externalId','displayName'],{allowVersions:true});expect(approved.summary.updated).toBe(1);
 expect((await finish(second.job.id)).job.updatedCount).toBe(1);
 const records=await admin.sourceRecord.findMany({where:{organisationId:a,externalId:'P-V'}});expect(records).toHaveLength(2);
 await expect(admin.sourceRecord.update({where:{id:records[0].id},data:{payload:{tampered:true}}})).rejects.toThrow();
});
it('rejects conflicting IDs, fingerprints, missing references and invalid financial values',async()=>{
 const participants=await upload('externalId,displayName\nP-C,One\nP-C,Two');await map(participants.job.id,['externalId','displayName']);expect((await finish(participants.job.id)).job.rejectedCount).toBe(2);
 const equivalent=await upload('externalId,displayName\nP-OTHER,Synthetic One');expect((await map(equivalent.job.id,['externalId','displayName'])).errors[0].code).toBe('FINGERPRINT_CONFLICT');
 const claims=await upload('externalId,participantExternalId,scheme,serviceExternalId,serviceDate,claimAmount\nC1,,ndis,NO-SERVICE,2026-02-30,1.999','claims');
 const cols=['externalId','participantExternalId','scheme','serviceExternalId','serviceDate','claimAmount'];
 const validation=await map(claims.job.id,cols);expect(validation.errors.map(e=>e.code)).toEqual(expect.arrayContaining(['REQUIRED','INVALID_DATE','INVALID_AMOUNT','MISSING_REFERENCE']));
 expect((await finish(claims.job.id)).job.status).toBe('COMPLETED_WITH_ERRORS');
 const report=await scope(tx=>validationReport(tx,a,claims.job.id));expect(report.csv).toContain('INVALID_AMOUNT');expect(report.csv).not.toContain('NO-SERVICE');
});
it('validates relationships and scheme boundaries for services, claims and payments',async()=>{
 const services=await upload('externalId,participantExternalId,scheme,serviceDate\nS1,P1,support_at_home,2026-11-20','services');await map(services.job.id,['externalId','participantExternalId','scheme','serviceDate']);expect((await finish(services.job.id)).job.successCount).toBe(1);
 const cols=['externalId','participantExternalId','scheme','serviceExternalId','serviceDate','claimAmount'];
 const claims=await upload(cols.join(',')+'\nC-OK,P1,support_at_home,S1,2026-11-20,123.45\nC-WRONG,P1,ndis,S1,2026-11-20,123.45','claims');await map(claims.job.id,cols);
 const result=await finish(claims.job.id);expect(result.job.successCount).toBe(1);expect(result.job.rejectedCount).toBe(1);
 const payments=await upload('externalId,scheme,claimExternalId,paymentDate,paymentAmount\nPAY1,support_at_home,C-OK,2026-11-23,123.45','payments');await map(payments.job.id,['externalId','scheme','claimExternalId','paymentDate','paymentAmount']);expect((await finish(payments.job.id)).job.successCount).toBe(1);
});
it('resumes interrupted batches, serialises concurrent processing and keeps retries idempotent',async()=>{
 const job=(await upload('externalId\n'+Array.from({length:120},(_,i)=>`BATCH-${i}`).join('\n'))).job;await map(job.id,['externalId']);
 expect((await step(job.id)).job.processedCount).toBe(50);
 // Re-enter through a new transaction, as after a disconnected browser.
 const outcomes=await Promise.all([step(job.id),step(job.id)]);expect(outcomes.some(r=>r.job.status==='COMPLETED')).toBe(true);
 const done=await step(job.id);expect(done.job.processedCount).toBe(120);expect(done.job.successCount).toBe(120);
 expect(await admin.sourceRecord.count({where:{importJobId:job.id}})).toBe(120);
});
it('rolls back a batch on interruption with no partial records or cursor advance',async()=>{
 const job=(await upload('externalId\nROLLBACK-1\nROLLBACK-2')).job;await map(job.id,['externalId']);
 await expect(scope(async tx=>{await processImport(tx,a,job.id,(await importDetail(tx,a,job.id)).job.configurationToken);throw new Error('Synthetic transaction interruption');})).rejects.toThrow();
 expect((await detail(job.id)).job.processedCount).toBe(0);expect(await admin.sourceRecord.count({where:{importJobId:job.id}})).toBe(0);
 expect((await finish(job.id)).job.successCount).toBe(2);
});
it('retains failed file validation in history and refuses processing it',async()=>{
 const job=(await upload('not a workbook','participants','CSV','bad.xlsx')).job;expect(job.status).toBe('FAILED');expect(job.errorCode).toBe('INVALID_FILE');
 await expect(step(job.id)).rejects.toMatchObject({status:409});expect((await detail(job.id)).headers).toEqual([]);
});
it('rejects invalid mapping before any source record is created',async()=>{
 const job=(await upload('externalId\nBAD-MAP')).job;
 await expect(map(job.id,['missing'])).rejects.toMatchObject({status:400});
 expect(await admin.sourceRecord.count({where:{importJobId:job.id}})).toBe(0);
});
it('denies anonymous, cross-organisation and same-tenant unauthorised requests',async()=>{
 const work=(tx:Prisma.TransactionClient)=>uploadImport(tx,a,{provider:'CSV',dataType:'participants',filename:'x.csv'},Buffer.from('externalId\nNOT-ALLOWED'));
 expect((await tenantApi(a,'imports.write',work,{client:runtime,identity:async()=>null})).status).toBe(401);
 expect((await tenantApi(b,'imports.write',work,{client:runtime,identity:async()=>identity()})).status).toBe(403);
 const role=await admin.role.findFirstOrThrow({where:{organisationId:a}});const grant={organisationId:a,roleId:role.id,permissionKey:'imports.write'};
 await admin.rolePermission.delete({where:{organisationId_roleId_permissionKey:grant}});
 try {
  expect((await tenantApi(a,'imports.write',work,{client:runtime,identity:async()=>identity()})).status).toBe(403);
  await expect(runtime.$transaction(async tx=>{await setContext(tx,userId,a);return work(tx);})).rejects.toThrow();
 }finally{await admin.rolePermission.create({data:grant});}
});
it('RLS isolates files, templates, errors and source snapshots even without query filters',async()=>{
 expect(await runtime.importFile.findMany()).toEqual([]);expect(await runtime.importMapping.findMany()).toEqual([]);expect(await runtime.importError.findMany()).toEqual([]);
 for(const tenant of [b]) {
  const result=await runtime.$transaction(async tx=>{await setContext(tx,userId,tenant);return {files:await tx.importFile.findMany(),templates:await tx.importMapping.findMany(),errors:await tx.importError.findMany(),sources:await tx.sourceRecord.findMany()};});
  expect(result).toEqual({files:[],templates:[],errors:[],sources:[]});
 }
 const otherConnection=await admin.integrationConnection.create({data:{organisationId:b,provider:'CSV'}});
 const file=await admin.importFile.findFirstOrThrow({where:{organisationId:a}});
 await expect(admin.importJob.create({data:{organisationId:b,connectionId:otherConnection.id,fileId:file.id,sourceName:'CSV',idempotencyKey:randomUUID()}})).rejects.toThrow();
});

it('rejects processing when another tab changed the preview configuration',async()=>{
 const job=(await upload('externalId\nSTALE-CONFIG')).job;await map(job.id,['externalId']);
 await expect(scope(tx=>processImport(tx,a,job.id,'0'.repeat(64)))).rejects.toMatchObject({status:409});
 expect(await admin.sourceRecord.count({where:{importJobId:job.id}})).toBe(0);
});
it('imports worker, agreement, invoice, funding and compliance reference structures',async()=>{
 const cases:[string,string,string[]][]=[
  ['workers','externalId,displayName\nW1,Synthetic Worker',['externalId','displayName']],
  ['agreements','externalId,participantExternalId,scheme,startDate,endDate\nA1,P1,support_at_home,2026-01-01,2026-12-31',['externalId','participantExternalId','scheme','startDate','endDate']],
  ['invoices','externalId,participantExternalId,scheme,invoiceDate,invoiceAmount\nI1,P1,support_at_home,2026-11-20,500.01',['externalId','participantExternalId','scheme','invoiceDate','invoiceAmount']],
  ['funding','externalId,participantExternalId,scheme,startDate,endDate,fundingAmount\nF1,P1,support_at_home,2026-01-01,2026-12-31,10000.00',['externalId','participantExternalId','scheme','startDate','endDate','fundingAmount']],
  ['compliance','externalId,workerExternalId,documentType,expiryDate\nD1,W1,Synthetic certificate,2027-01-01',['externalId','workerExternalId','documentType','expiryDate']],
 ];
 for(const [type,text,columns] of cases){const {job}=await upload(text,type);await map(job.id,columns);expect((await finish(job.id)).job.successCount).toBe(1);}
});
it('records a failed integrity check and safely retries after storage is restored',async()=>{
 const {job}=await upload('externalId\nRECOVER-STORAGE');await map(job.id,['externalId']);
 const token=(await detail(job.id)).job.configurationToken;
 const file=await admin.importFile.findFirstOrThrow({where:{id:job.fileId!}});const corrupt=Buffer.from(file.encryptedContent);corrupt[15]^=1;
 await admin.importFile.update({where:{id:file.id},data:{encryptedContent:corrupt}});
 try {const failed=await scope(tx=>processImport(tx,a,job.id,token));expect(failed.job.status).toBe('FAILED');expect(failed.job.errorCode).toBe('FILE_UNAVAILABLE');expect(failed.job.processedCount).toBe(0);}
 finally{await admin.importFile.update({where:{id:file.id},data:{encryptedContent:file.encryptedContent}});}
 expect((await finish(job.id)).job.successCount).toBe(1);
});
