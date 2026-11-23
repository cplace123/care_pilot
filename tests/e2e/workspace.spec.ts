import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { decryptMfaSecret, totp } from '../../src/lib/mfa';
const databaseUrl = new URL(process.env.DIRECT_DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) || databaseUrl.pathname !== '/carepilot' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('E2E tests require the explicitly enabled local demo database');
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.toString() }) });
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
test.beforeEach(async () => {
 await admin.loginThrottle.deleteMany();
 await admin.user.updateMany({ where: { email: { endsWith: '.example' } }, data: { mfaLastStep: null } });
});
test.afterAll(async () => { await admin.$disconnect(); });
async function login(page: Page, email = 'owner@harbour.example') {
 await page.goto('/login');
 await page.getByLabel('Work email').fill(email);
 await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_SEED_PASSWORD!);
 const user = await admin.user.findUniqueOrThrow({ where: { email } });
 if (user.mfaSecretEncrypted) await page.getByLabel('Authenticator code', { exact: false }).fill(totp(decryptMfaSecret(user.mfaSecretEncrypted)));
 await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
 await expect(page.getByRole('heading', { name: 'Choose your organisation' })).toBeVisible();
}
async function openNav(page: Page) { if (await page.locator('.mobile-navigation').isVisible() && await page.locator('.mobile-navigation details').getAttribute('open') === null) await page.locator('summary').click(); }
test('protects routes and shows a generic error for bad credentials', async ({ page }) => {
 await page.goto(`/app/${a}/finance`); await expect(page).toHaveURL(/\/login/);
 await page.getByLabel('Work email').fill('unknown@synthetic.example');
 await page.getByLabel('Password', { exact: true }).fill('wrong-password');
 await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
 await expect(page.locator('form').getByRole('alert')).toContainText('Unable to sign in');
});
test('requires MFA for privileged login', async ({ page }) => {
 await page.goto('/login'); await page.getByLabel('Work email').fill('owner@harbour.example');
 await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_SEED_PASSWORD!);
 await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
 await expect(page.locator('form').getByRole('alert')).toContainText('Unable to sign in');
});
test('supports the complete shell, filters, theme persistence and revocable logout', async ({ page }) => {
 const browserErrors: string[] = []; page.on('pageerror', error => browserErrors.push(error.message));
 await login(page);
 await expect(page.getByText('Wattle Support · Demo')).toHaveCount(0);
 await page.getByRole('link', { name: /Harbour Care/ }).click();
 await expect(page.getByRole('heading', { name: 'A clearer view of your day.' })).toBeVisible();
 await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
 await expect(page.getByText('Foundation preview.', { exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Switch to dark theme' }).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
 await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
 await page.getByRole('button', { name: 'Switch to light theme' }).click();
 await page.getByRole('link', { name: 'Review priority issues' }).click();
 await page.getByLabel('Priority', { exact: true }).selectOption('Medium');
 await expect(page.getByRole('heading', { name: 'Review an upcoming screening expiry' })).toBeVisible();
 await expect(page.getByRole('heading', { name: 'Check a payment difference' })).toHaveCount(0);
 const pages = [ ['Compliance', 'Confidence starts with evidence.'], ['Finance', 'See the story behind the numbers.'], ['AI Assistant', 'An extra hand. You’re in control.'], ['Integrations', 'Keep the systems you know.'], ['Reports', 'The bigger picture, made clear.'], ['Settings', 'Your organisation, your workspace.'] ];
 for (const [name, heading] of pages) {
  await openNav(page);
  await page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true }).getByRole('link', { name, exact: name !== 'AI Assistant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 }
 await page.goto(`/app/${a}`);
 await page.screenshot({ path: `test-results/dashboard-${test.info().project.name}.png`, fullPage: true });
 const cookies = await page.context().cookies();
 await openNav(page);
 await page.getByRole('button', { name: 'Sign out' }).filter({ visible: true }).click();
 await expect(page).toHaveURL(/\/login/);
 await page.context().addCookies(cookies);
 expect((await page.request.get(`/api/organisations/${a}`)).status()).toBe(401);
 const revokedSession = await (await page.request.get('/api/auth/session')).json();
 expect(revokedSession.user?.id ?? '').toBe('');
 await page.goto(`/app/${a}`); await expect(page).toHaveURL(/\/login/);
 expect(browserErrors).toEqual([]);
});
test('denies a foreign organisation URL and a same-tenant restricted page', async ({ page }) => {
 await login(page, 'auditor@harbour.example');
 await page.goto(`/app/${b}`); await expect(page.getByRole('heading', { name: 'This page isn’t available.' })).toBeVisible();
 await page.goto(`/app/${a}/integrations`); await expect(page.getByRole('heading', { name: 'This page isn’t available.' })).toBeVisible();
 await page.goto(`/app/${a}/finance`); await expect(page.getByRole('heading', { name: 'See the story behind the numbers.' })).toBeVisible();
});
test('supports multiple memberships and combined roles without granting integration access', async ({ page }) => {
 await login(page, 'manager@carepilot.example');
 await expect(page.getByRole('link', { name: /Harbour Care/ })).toBeVisible();
 await page.getByRole('link', { name: /Wattle Support/ }).click();
 await expect(page.getByRole('heading', { name: 'A clearer view of your day.' })).toBeVisible();
 await page.goto(`/app/${b}/compliance`); await expect(page.getByRole('heading', { name: 'Confidence starts with evidence.' })).toBeVisible();
 await page.goto(`/app/${b}/finance`); await expect(page.getByRole('heading', { name: 'See the story behind the numbers.' })).toBeVisible();
 await page.goto(`/app/${b}/integrations`); await expect(page.getByRole('heading', { name: 'This page isn’t available.' })).toBeVisible();
});

test('does not create a session from a credentials POST without a CSRF token', async ({ request }) => {
 const user = await admin.user.findUniqueOrThrow({ where: { email: 'auditor@harbour.example' } });
 const before = await admin.authSession.count({ where: { userId: user.id } });
 await request.post('/api/auth/callback/credentials', { form: { email: user.email, password: process.env.DEMO_SEED_PASSWORD!, json: 'true' } });
 expect(await admin.authSession.count({ where: { userId: user.id } })).toBe(before);
 const session = await request.get('/api/auth/session');
 expect(await session.json()).toEqual({});
});

test('protects foundation APIs and rejects cross-origin or overprivileged writes', async ({ page, request }) => {
 expect((await request.get(`/api/organisations/${a}`)).status()).toBe(401);
 await login(page);
 const api = page.request;
 const own = await api.get(`/api/organisations/${a}`);
 expect(own.status()).toBe(200);
 expect(own.headers()['cache-control']).toContain('no-store');
 expect((await api.get(`/api/organisations/${b}`)).status()).toBe(403);
 expect((await api.get(`/api/organisations/${a}/sources`)).status()).toBe(200);
 const connections = await (await api.get(`/api/organisations/${a}/integrations`)).json();
 expect(connections).toHaveLength(6);
 expect(JSON.stringify(connections)).not.toContain('credentialReference');
 const path = `/api/organisations/${a}/integrations/${connections[0].id}`;
 expect((await api.patch(path, { headers: { origin: 'https://foreign.example' }, data: { displayName: 'Blocked' } })).status()).toBe(403);
 expect((await api.patch(path, { data: { displayName: 'Blocked' } })).status()).toBe(403);
 expect((await api.patch(path, { headers: { origin: 'http://localhost:3000' }, data: { status: 'CONNECTED', displayName: 'Blocked' } })).status()).toBe(400);
 try {
  expect((await api.patch(path, { headers: { origin: 'http://localhost:3000' }, data: { displayName: 'Synthetic display name' } })).status()).toBe(200);
  const events = await (await api.get(`/api/organisations/${a}/audit`)).json();
  expect(events.some((event: { action: string }) => event.action === 'integration.configuration_changed')).toBe(true);
 } finally { await admin.integrationConnection.update({ where: { id: connections[0].id }, data: { displayName: connections[0].displayName } }); }
});
