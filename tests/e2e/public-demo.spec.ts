import 'dotenv/config';
import {test,expect} from '@playwright/test';
test.skip(process.env.PUBLIC_DEMO_ENABLED!=='true','Public demo is opt-in');
test('opens without credentials and isolates the synthetic workspace',async({page})=>{
 await page.goto('/');await expect(page).toHaveURL(new RegExp(`/app/${process.env.PUBLIC_DEMO_ORGANISATION_ID}$`));
 await expect(page.getByText('Public demo · shared workspace.')).toBeVisible();
 expect((await page.request.get('/api/organisations/11111111-1111-4111-8111-111111111111')).status()).toBe(403);
 const org=process.env.PUBLIC_DEMO_ORGANISATION_ID!;
 expect((await page.request.patch(`/api/organisations/${org}`,{headers:{origin:'http://localhost:3000'},data:{name:'Blocked'}})).status()).toBe(403);
 await page.goto(`/app/${org}/integrations`);await page.getByRole('button',{name:'Import Data',exact:true}).click();
 await page.getByLabel('CSV or Excel file').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(`externalId\nPUBLIC-${crypto.randomUUID()}`)});
 await page.getByRole('button',{name:'Upload and map'}).click();await page.getByRole('button',{name:'Validate and preview'}).click();await page.getByRole('button',{name:'Import valid records'}).click();await expect(page.getByRole('status')).toContainText('Import complete: 1 saved');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('keeps manual organisation login and CSRF protection available',async({page,request})=>{
 await page.goto('/login?account=1');await expect(page.getByLabel('Work email')).toBeVisible();
 await request.post('/api/auth/callback/credentials',{form:{demo:'true',json:'true'}});expect(await(await request.get('/api/auth/session')).json()).toEqual({});
});
