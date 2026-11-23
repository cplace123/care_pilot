import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,expect,it,vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { authenticatePublicDemo } from '@/lib/server/public-demo-auth';
import { PUBLIC_DEMO_EMAIL, publicDemoPermissions } from '@/lib/server/public-demo-config';
import { AccessDenied,assertSession,listOrganisations,withOrganisation } from '@/lib/server/access';
import { uploadImport } from '@/lib/server/imports';
import { digest } from '@/lib/password';
const url=new URL(process.env.DIRECT_DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/carepilot'||process.env.ALLOW_DEMO_SEED!=='true')throw Error('Local synthetic database required');
const admin=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});const runtime=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const org=randomUUID(),foreign=randomUUID();let userId:string,roleId:string;const sessions:string[]=[];
beforeAll(async()=>{
 const example=await admin.user.findUniqueOrThrow({where:{email:'auditor@harbour.example'}});
 userId=(await admin.user.upsert({where:{email:PUBLIC_DEMO_EMAIL},create:{email:PUBLIC_DEMO_EMAIL,name:'Public demo visitor',passwordHash:example.passwordHash},update:{}})).id;
 await admin.organisation.createMany({data:[{id:org,name:'Synthetic public test'},{id:foreign,name:'Other tenant'}]});
 const m=await admin.organisationMembership.create({data:{organisationId:org,userId}});
 await admin.organisationMembership.create({data:{organisationId:foreign,userId}});
 roleId=(await admin.role.create({data:{organisationId:org,name:'Public Demo'}})).id;
 await admin.rolePermission.createMany({data:publicDemoPermissions.map(permissionKey=>({organisationId:org,roleId,permissionKey}))});
 await admin.membershipRole.create({data:{organisationId:org,membershipId:m.id,roleId}});
 vi.stubEnv('PUBLIC_DEMO_ENABLED','true');vi.stubEnv('PUBLIC_DEMO_USER_ID',userId);vi.stubEnv('PUBLIC_DEMO_ORGANISATION_ID',org);vi.stubEnv('PUBLIC_DEMO_EXPIRES_AT',new Date(Date.now()+3600000).toISOString());
 await admin.loginThrottle.deleteMany({where:{key:digest(`public-demo:${userId}`)}});
});
afterAll(async()=>{vi.unstubAllEnvs();await admin.authSession.deleteMany({where:{id:{in:sessions}}});await admin.loginThrottle.deleteMany({where:{key:digest(`public-demo:${userId}`)}});await admin.$disconnect();await runtime.$disconnect();});
async function login(){const user=await authenticatePublicDemo(runtime);expect(user).not.toBeNull();sessions.push(user!.sessionId);return {userId:user!.id,sessionId:user!.sessionId};}
it('creates an audited bounded demo session and limits organisation discovery',async()=>{
 const identity=await login();const session=await runtime.$transaction(tx=>assertSession(tx,identity));expect(session.mfaVerified).toBe(false);expect(session.expiresAt.getTime()-Date.now()).toBeLessThanOrEqual(3600000);
 expect((await listOrganisations(runtime,identity)).map(m=>m.organisation.id)).toEqual([org]);
 expect(await withOrganisation(runtime,identity,org,'imports.write',async()=>true)).toBe(true);
 await expect(withOrganisation(runtime,identity,foreign,'dashboard.read',async()=>true)).rejects.toBeInstanceOf(AccessDenied);
 await expect(withOrganisation(runtime,identity,org,'organisation.configure',async()=>true)).rejects.toBeInstanceOf(AccessDenied);
 expect(await admin.activityEvent.count({where:{actorId:userId,organisationId:org,action:'auth.public_demo_started'}})).toBeGreaterThan(0);
});
it('rejects new and existing demo sessions immediately when disabled or expired',async()=>{
 const identity=await login();vi.stubEnv('PUBLIC_DEMO_ENABLED','false');expect(await authenticatePublicDemo(runtime)).toBeNull();await expect(runtime.$transaction(tx=>assertSession(tx,identity))).rejects.toBeInstanceOf(AccessDenied);
 vi.stubEnv('PUBLIC_DEMO_ENABLED','true');vi.stubEnv('PUBLIC_DEMO_EXPIRES_AT',new Date(0).toISOString());expect(await authenticatePublicDemo(runtime)).toBeNull();await expect(runtime.$transaction(tx=>assertSession(tx,identity))).rejects.toBeInstanceOf(AccessDenied);
 vi.stubEnv('PUBLIC_DEMO_EXPIRES_AT',new Date(Date.now()+3600000).toISOString());
});
it('fails closed if privileges or the configured identity are changed',async()=>{
 const identity=await login();const grant={organisationId:org,roleId,permissionKey:'organisation.configure'};await admin.rolePermission.create({data:grant});
 try{expect(await authenticatePublicDemo(runtime)).toBeNull();await expect(withOrganisation(runtime,identity,org,'imports.write',async()=>true)).rejects.toBeInstanceOf(AccessDenied);}
 finally{await admin.rolePermission.delete({where:{organisationId_roleId_permissionKey:grant}});}
 const owner=await admin.user.findUniqueOrThrow({where:{email:'owner@harbour.example'}});vi.stubEnv('PUBLIC_DEMO_USER_ID',owner.id);expect(await authenticatePublicDemo(runtime)).toBeNull();vi.stubEnv('PUBLIC_DEMO_USER_ID',userId);
});
it('applies smaller public upload limits before storing a file',async()=>{
 const identity=await login();
 await expect(withOrganisation(runtime,identity,org,'imports.write',tx=>uploadImport(tx,org,{provider:'CSV',dataType:'participants',filename:'synthetic.csv'},Buffer.alloc(1048577)))).rejects.toMatchObject({status:413});
 expect(await admin.importFile.count({where:{organisationId:org}})).toBe(0);
});
it('bounds public session admission independently of password login throttling',async()=>{
 const key=digest(`public-demo:${userId}`);await admin.loginThrottle.upsert({where:{key},create:{key,attempts:100,resetAt:new Date(Date.now()+60000)},update:{attempts:100,resetAt:new Date(Date.now()+60000)}});expect(await authenticatePublicDemo(runtime)).toBeNull();
});
