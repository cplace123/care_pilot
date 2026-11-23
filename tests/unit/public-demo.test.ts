import { afterEach,expect,it,vi } from 'vitest';
import { publicDemoConfig, safePublicDemoGrants, publicDemoPermissions } from '@/lib/server/public-demo-config';
afterEach(()=>vi.unstubAllEnvs());
it('disables public access by default and requires valid identities and expiry',()=>{
 vi.stubEnv('PUBLIC_DEMO_ENABLED','false');expect(publicDemoConfig()).toBeNull();
 vi.stubEnv('PUBLIC_DEMO_ENABLED','true');vi.stubEnv('PUBLIC_DEMO_USER_ID','invalid');expect(publicDemoConfig()).toBeNull();
 vi.stubEnv('PUBLIC_DEMO_USER_ID','11111111-1111-4111-8111-111111111111');vi.stubEnv('PUBLIC_DEMO_ORGANISATION_ID','22222222-2222-4222-8222-222222222222');
 vi.stubEnv('PUBLIC_DEMO_EXPIRES_AT',new Date(Date.now()-1000).toISOString());expect(publicDemoConfig()).toBeNull();
 vi.stubEnv('PUBLIC_DEMO_EXPIRES_AT',new Date(Date.now()+60000).toISOString());expect(publicDemoConfig()?.userId).toBe('11111111-1111-4111-8111-111111111111');
});
it('allows demo capabilities without configuration, audit or privileged roles',()=>{
 expect(safePublicDemoGrants(['Public Demo'],[...publicDemoPermissions])).toBe(true);
 for(const permission of ['organisation.configure','integrations.configure','audit.read']) expect(safePublicDemoGrants(['Public Demo'],[...publicDemoPermissions,permission])).toBe(false);
 expect(safePublicDemoGrants(['Organisation Owner'],['dashboard.read'])).toBe(false);expect(safePublicDemoGrants(['Public Demo','Administrator'],['dashboard.read'])).toBe(false);
});
