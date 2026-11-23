import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AccessDenied, listOrganisations, setContext, withOrganisation } from '@/lib/server/access';
import { authenticate, revokeSession } from '@/lib/server/auth-service';
import { tenantApi, readMutation } from '@/lib/server/api';
import { digest } from '@/lib/password';
import { decryptMfaSecret, totp } from '@/lib/mfa';
const url = new URL(process.env.DIRECT_DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/carepilot' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Integration tests require the explicitly enabled local demo database');
const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
const runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
let ownerId: string, auditorId: string;
const sid = 'integration-' + randomUUID(), auditorSid = 'integration-' + randomUUID();
const identity = () => ({ userId: ownerId, sessionId: sid });
beforeAll(async () => {
 await admin.loginThrottle.deleteMany();
 ownerId = (await admin.user.findUniqueOrThrow({ where: { email: 'owner@harbour.example' } })).id;
 auditorId = (await admin.user.findUniqueOrThrow({ where: { email: 'auditor@harbour.example' } })).id;
 await admin.authSession.createMany({ data: [ { id: sid, userId: ownerId, mfaVerified: true, expiresAt: new Date(Date.now() + 600000) }, { id: auditorSid, userId: auditorId, expiresAt: new Date(Date.now() + 600000) } ] });
});
afterAll(async () => { await admin.authSession.deleteMany({ where: { id: { in: [sid, auditorSid] } } }); await runtime.$disconnect(); await admin.$disconnect(); });
describe('PostgreSQL tenant boundaries', () => {
 it('uses an unprivileged runtime role', async () => {
  const roles = await runtime.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean }[]>`SELECT rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
  expect(roles[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false });
 });
 it('discovers only active memberships belonging to the signed-in user', async () => {
  expect((await listOrganisations(runtime, identity())).map(m => m.organisation.id)).toEqual([a]);
 });
 it('allows own data and rejects an explicit foreign tenant ID', async () => {
  expect(await withOrganisation(runtime, identity(), a, 'integrations.read', tx => tx.integrationConnection.count({ where: { organisationId: a } }))).toBeGreaterThanOrEqual(6);
  await expect(withOrganisation(runtime, identity(), b, 'integrations.read', tx => tx.integrationConnection.findMany())).rejects.toBeInstanceOf(AccessDenied);
 });
 it('RLS blocks unscoped reads and foreign records even without a where filter', async () => {
  expect(await runtime.integrationConnection.findMany()).toEqual([]);
  const connections = await withOrganisation(runtime, identity(), a, 'integrations.read', tx => tx.integrationConnection.findMany());
  expect(connections.length).toBeGreaterThanOrEqual(6); expect(connections.every(c => c.organisationId === a)).toBe(true);
  expect(await withOrganisation(runtime, identity(), a, 'integrations.read', tx => tx.integrationConnection.findMany({ where: { organisationId: b } }))).toEqual([]);
  expect(await runtime.integrationConnection.findMany()).toEqual([]);
 });
 it('rejects cross-tenant audit writes and keeps history immutable', async () => {
  await expect(withOrganisation(runtime, identity(), a, 'dashboard.read', tx => tx.activityEvent.create({ data: { organisationId: b, action: 'test.invalid' } }))).rejects.toThrow();
  const event = await admin.activityEvent.findFirstOrThrow({ where: { organisationId: a } });
  await expect(admin.activityEvent.update({ where: { id: event.id }, data: { action: 'tampered' } })).rejects.toThrow();
  await expect(runtime.activityEvent.delete({ where: { id: event.id } })).rejects.toThrow();
 });
 it('composite keys reject cross-tenant import connections and role assignments', async () => {
  const connection = await admin.integrationConnection.findFirstOrThrow({ where: { organisationId: b } });
  await expect(admin.importJob.create({ data: { organisationId: a, connectionId: connection.id, sourceName: 'synthetic.csv', idempotencyKey: randomUUID() } })).rejects.toThrow();
  const membership = await admin.organisationMembership.findUniqueOrThrow({ where: { organisationId_userId: { organisationId: a, userId: ownerId } } });
  const role = await admin.role.findFirstOrThrow({ where: { organisationId: b } });
  await expect(admin.membershipRole.create({ data: { organisationId: a, membershipId: membership.id, roleId: role.id } })).rejects.toThrow();
 });
 it('enforces permissions for a same-tenant auditor on the server', async () => {
  await expect(withOrganisation(runtime, { userId: auditorId, sessionId: auditorSid }, a, 'integrations.read', async () => true)).rejects.toBeInstanceOf(AccessDenied);
  expect(await withOrganisation(runtime, { userId: auditorId, sessionId: auditorSid }, a, 'compliance.read', async () => true)).toBe(true);
 });
 it('rechecks role permissions rather than trusting session claims', async () => {
  const role = await admin.role.findUniqueOrThrow({ where: { organisationId_name: { organisationId: a, name: 'Organisation Owner' } } });
  const grant = { organisationId: a, roleId: role.id, permissionKey: 'dashboard.read' };
  await admin.rolePermission.delete({ where: { organisationId_roleId_permissionKey: grant } });
  try { await expect(withOrganisation(runtime, identity(), a, 'dashboard.read', async () => true)).rejects.toBeInstanceOf(AccessDenied); }
  finally { await admin.rolePermission.create({ data: grant }); }
 });
 it('applies membership revocation immediately', async () => {
  await admin.organisationMembership.update({ where: { organisationId_userId: { organisationId: a, userId: ownerId } }, data: { active: false } });
  try { await expect(withOrganisation(runtime, identity(), a, 'dashboard.read', async () => true)).rejects.toBeInstanceOf(AccessDenied); }
  finally { await admin.organisationMembership.update({ where: { organisationId_userId: { organisationId: a, userId: ownerId } }, data: { active: true } }); }
 });
 it('requires MFA assurance when a session accesses a privileged role', async () => {
  await admin.authSession.update({ where: { id: sid }, data: { mfaVerified: false } });
  try { await expect(withOrganisation(runtime, identity(), a, 'dashboard.read', async () => true)).rejects.toBeInstanceOf(AccessDenied); }
  finally { await admin.authSession.update({ where: { id: sid }, data: { mfaVerified: true } }); }
 });
 it('does not leak transaction context across concurrent organisations', async () => {
  const outcomes = await Promise.all(Array.from({ length: 8 }, (_, i) => runtime.$transaction(async tx => { await setContext(tx, ownerId, i % 2 ? a : b); return tx.integrationConnection.findMany(); })));
  outcomes.forEach((rows, i) => expect(rows.every(row => row.organisationId === (i % 2 ? a : b))).toBe(true));
 });
});
describe('Stage 2 database and API enforcement', () => {
 it('rejects a forged organisation context even when bypassing the application helper', async () => {
  const rows = await runtime.$transaction(async tx => { await setContext(tx, ownerId, b); return tx.integrationConnection.findMany(); });
  expect(rows).toEqual([]);
 });
 it('returns safe API errors for anonymous, foreign, unauthorised and invalid requests', async () => {
  const work = async () => ({ ok: true });
  expect((await tenantApi(a, 'settings.read', work, { client: runtime, identity: async () => null })).status).toBe(401);
  expect((await tenantApi(b, 'settings.read', work, { client: runtime, identity: async () => identity() })).status).toBe(403);
  expect((await tenantApi(a, 'organisation.configure', work, { client: runtime, identity: async () => ({ userId: auditorId, sessionId: auditorSid }) })).status).toBe(403);
  expect((await tenantApi('invalid', 'settings.read', work, { client: runtime, identity: async () => identity() })).status).toBe(400);
  const result = await tenantApi(a, 'settings.read', async () => { throw new Error('secret database details'); }, { client: runtime, identity: async () => identity() });
  expect(result.status).toBe(500); expect(await result.text()).not.toContain('secret');
 });
 it('requires same-origin JSON with bounded input for cookie-authenticated writes', async () => {
  const request = (origin: string, body: string, type = 'application/json') => new Request('http://localhost:3000/api/test', { method: 'PATCH', headers: { origin, 'content-type': type }, body });
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  await expect(readMutation(request('https://foreign.example', '{}'))).rejects.toMatchObject({ status: 403 });
  await expect(readMutation(request(origin, '{}', 'text/plain'))).rejects.toMatchObject({ status: 415 });
  await expect(readMutation(request(origin, 'x'.repeat(16385)))).rejects.toMatchObject({ status: 413 });
  await expect(readMutation(request(origin, '{'))).rejects.toMatchObject({ status: 400 });
  expect(await readMutation(request(origin, '{"name":"Synthetic"}'))).toEqual({ name: 'Synthetic' });
 });
 it('atomically audits configuration changes with actor and safe metadata', async () => {
  const original = await admin.organisation.findUniqueOrThrow({ where: { id: a } });
  const since = new Date();
  try {
   const response = await tenantApi(a, 'organisation.configure', tx => tx.organisation.update({ where: { id: a }, data: { name: 'Synthetic test organisation' } }), { client: runtime, identity: async () => identity() });
   expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
   const event = await admin.activityEvent.findFirstOrThrow({ where: { organisationId: a, actorId: ownerId, action: 'organisation.configuration_changed', createdAt: { gte: since } } });
   expect(event.metadata).toEqual({ table: 'Organisation', operation: 'UPDATE', actorType: 'user' });
  } finally { await admin.organisation.update({ where: { id: a }, data: { name: original.name } }); }
 });
 it('enforces source-record composite keys, uniqueness and tenant isolation', async () => {
  const connection = await admin.integrationConnection.findFirstOrThrow({ where: { organisationId: a } });
  const other = await admin.integrationConnection.findFirstOrThrow({ where: { organisationId: a, id: { not: connection.id } } });
  const job = await admin.importJob.create({ data: { organisationId: a, connectionId: connection.id, sourceName: 'synthetic', idempotencyKey: randomUUID() } });
  const data = { organisationId: a, connectionId: connection.id, importJobId: job.id, sourceType: 'synthetic', externalId: randomUUID(), contentHash: 'a'.repeat(64), payload: { synthetic: true } };
  const source = await admin.sourceRecord.create({ data });
  {
   await expect(admin.sourceRecord.create({ data })).rejects.toThrow();
   await expect(admin.sourceRecord.create({ data: { ...data, externalId: randomUUID(), organisationId: b } })).rejects.toThrow();
   await expect(admin.sourceRecord.create({ data: { ...data, externalId: randomUUID(), connectionId: other.id } })).rejects.toThrow();
   await expect(admin.sourceRecord.create({ data: { ...data, externalId: randomUUID(), contentHash: 'invalid' } })).rejects.toThrow();
   expect(await runtime.sourceRecord.findMany()).toEqual([]);
   expect(await withOrganisation(runtime, identity(), a, 'sources.read', tx => tx.sourceRecord.count({ where: { id: source.id } }))).toBe(1);
   await expect(withOrganisation(runtime, identity(), a, 'sources.read', tx => tx.sourceRecord.delete({ where: { id: source.id } }))).rejects.toThrow();
   expect(await admin.activityEvent.count({ where: { resourceId: source.id, action: 'import.source_recorded' } })).toBe(1);
   expect(await admin.activityEvent.count({ where: { resourceId: job.id, action: 'import.changed' } })).toBe(1);
   await expect(admin.sourceRecord.delete({ where: { id: source.id } })).rejects.toThrow();
  } // Retain immutable synthetic evidence, as in production.
 });
 it('limits integration metadata and prevents runtime credential/status writes', async () => {
  const c = await admin.integrationConnection.findFirstOrThrow({ where: { organisationId: a } });
  await expect(admin.integrationConnection.update({ where: { id: c.id }, data: { credentialReference: 'plaintext-api-key' } })).rejects.toThrow();
  await expect(admin.integrationConnection.update({ where: { id: c.id }, data: { provider: 'unknown' } })).rejects.toThrow();
  await expect(withOrganisation(runtime, identity(), a, 'integrations.configure', tx => tx.integrationConnection.update({ where: { id: c.id }, data: { status: 'CONNECTED' } }))).rejects.toThrow();
  try {
   await withOrganisation(runtime, identity(), a, 'integrations.configure', tx => tx.integrationConnection.update({ where: { id: c.id }, data: { displayName: 'Synthetic connector' } }));
   expect(await admin.activityEvent.count({ where: { resourceId: c.id, actorId: ownerId, action: 'integration.configuration_changed' } })).toBeGreaterThan(0);
  } finally { await admin.integrationConnection.update({ where: { id: c.id }, data: { displayName: c.displayName } }); }
 });
 it('keeps security failures outside tenant-visible history and protects truncation', async () => {
  expect(await admin.activityEvent.count({ where: { action: 'access.denied', organisationId: null } })).toBeGreaterThan(0);
  expect(await withOrganisation(runtime, identity(), a, 'audit.read', tx => tx.activityEvent.findMany({ where: { organisationId: null } }))).toEqual([]);
  await expect(admin.$executeRaw`TRUNCATE "ActivityEvent"`).rejects.toThrow();
  expect(await admin.activityEvent.count({ where: { organisationId: a, action: 'permission.changed' } })).toBeGreaterThan(0);
 });
});
describe('authentication and session lifecycle', () => {
 it('rejects wrong credentials and unknown users with the same outcome', async () => {
  expect(await authenticate(runtime, 'nobody@synthetic.example', 'incorrect')).toBeNull();
  expect(await authenticate(runtime, 'auditor@harbour.example', 'incorrect')).toBeNull();
 });
 it('requires owner MFA, consumes codes once, and audits successful login/logout', async () => {
  const owner = await admin.user.findUniqueOrThrow({ where: { id: ownerId } });
  await admin.user.update({ where: { id: ownerId }, data: { mfaLastStep: null } });
  expect(await authenticate(runtime, owner.email, process.env.DEMO_SEED_PASSWORD!)).toBeNull();
  const code = totp(decryptMfaSecret(owner.mfaSecretEncrypted!));
  const result = await authenticate(runtime, owner.email, process.env.DEMO_SEED_PASSWORD!, code);
  expect(result).not.toBeNull();
  expect(await authenticate(runtime, owner.email, process.env.DEMO_SEED_PASSWORD!, code)).toBeNull();
  await revokeSession(runtime, result!.sessionId, ownerId);
  await expect(withOrganisation(runtime, { userId: ownerId, sessionId: result!.sessionId }, a, 'dashboard.read', async () => true)).rejects.toBeInstanceOf(AccessDenied);
  const events = await admin.activityEvent.findMany({ where: { resourceId: digest(result!.sessionId) }, orderBy: { createdAt: 'asc' } });
  expect(events.map(e => e.action)).toEqual(['auth.login', 'auth.logout']);
 });
 it('audits login/logout with no active membership without exposing events to tenants', async () => {
  const where = { organisationId_userId: { organisationId: a, userId: auditorId } };
  await admin.organisationMembership.update({ where, data: { active: false } });
  try {
   const result = await authenticate(runtime, 'auditor@harbour.example', process.env.DEMO_SEED_PASSWORD!);
   expect(result).not.toBeNull();
   await revokeSession(runtime, result!.sessionId, auditorId);
   const events = await admin.activityEvent.findMany({ where: { resourceId: digest(result!.sessionId) }, orderBy: { createdAt: 'asc' } });
   expect(events.map(event => event.action)).toEqual(['auth.login', 'auth.logout']);
   expect(events.every(event => event.organisationId === null && event.actorId === auditorId)).toBe(true);
  } finally { await admin.organisationMembership.update({ where, data: { active: true } }); }
 });
 it('rejects expired sessions and disabled accounts', async () => {
  await admin.authSession.update({ where: { id: auditorSid }, data: { expiresAt: new Date(0) } });
  await expect(withOrganisation(runtime, { userId: auditorId, sessionId: auditorSid }, a, 'dashboard.read', async () => true)).rejects.toBeInstanceOf(AccessDenied);
  await admin.user.update({ where: { id: auditorId }, data: { active: false } });
  try { expect(await authenticate(runtime, 'auditor@harbour.example', process.env.DEMO_SEED_PASSWORD!)).toBeNull(); }
  finally { await admin.user.update({ where: { id: auditorId }, data: { active: true } }); }
 });
 it('persists throttling across attempts in the database', async () => {
  const email = `throttle-${randomUUID()}@synthetic.example`;
  for (let i = 0; i < 11; i++) expect(await authenticate(runtime, email, 'incorrect')).toBeNull();
  const { digest } = await import('@/lib/password');
  expect((await admin.loginThrottle.findUniqueOrThrow({ where: { key: digest(email) } })).attempts).toBe(11);
 });
});
