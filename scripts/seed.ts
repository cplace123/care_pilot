import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateMfaSecret, encryptMfaSecret } from '../src/lib/mfa';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/lib/password';
import { defaultRoles, permissionDescriptions } from '../src/lib/permissions';
const url = new URL(process.env.DIRECT_DATABASE_URL ?? '');
if (process.env.ALLOW_DEMO_SEED !== 'true' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/carepilot') throw new Error('Demo seeding requires ALLOW_DEMO_SEED=true and the local carepilot database');
const password = process.env.DEMO_SEED_PASSWORD ?? '';
if (password.startsWith('REPLACE')) throw new Error('Generate a unique demo password');
const passwordHash = await hashPassword(password);
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
const organisations = [
 { id: '11111111-1111-4111-8111-111111111111', name: 'Harbour Care · Demo' },
 { id: '22222222-2222-4222-8222-222222222222', name: 'Wattle Support · Demo' },
];
const mfaSecrets: Record<string, string> = (() => { try { return JSON.parse(readFileSync('.demo-mfa.json', 'utf8')); } catch { return {}; } })();
try {
 for (const [key, description] of Object.entries(permissionDescriptions)) await client.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
 for (const organisation of organisations) {
  await client.organisation.upsert({ where: { id: organisation.id }, create: organisation, update: { name: organisation.name } });
  for (const [name, keys] of Object.entries(defaultRoles)) {
   const role = await client.role.upsert({ where: { organisationId_name: { organisationId: organisation.id, name } }, create: { organisationId: organisation.id, name }, update: {} });
   for (const permissionKey of keys) await client.rolePermission.upsert({ where: { organisationId_roleId_permissionKey: { organisationId: organisation.id, roleId: role.id, permissionKey } }, create: { organisationId: organisation.id, roleId: role.id, permissionKey }, update: {} });
  }
  for (const provider of ['ShiftCare', 'AlayaCare', 'Lumary', 'Visualcare', 'Xero', 'MYOB']) await client.integrationConnection.upsert({ where: { organisationId_provider: { organisationId: organisation.id, provider } }, create: { organisationId: organisation.id, provider }, update: {} });
  const exists = await client.activityEvent.findFirst({ where: { organisationId: organisation.id, action: 'workspace.demo_seeded' } });
  if (!exists) await client.activityEvent.create({ data: { organisationId: organisation.id, action: 'workspace.demo_seeded' } });
 }
 const accounts = [
  { email: 'owner@harbour.example', name: 'Alex Morgan', orgs: [0], roles: ['Organisation Owner'] },
  { email: 'owner@wattle.example', name: 'Jordan Taylor', orgs: [1], roles: ['Organisation Owner'] },
  { email: 'auditor@harbour.example', name: 'Casey Lee', orgs: [0], roles: ['Auditor'] },
  { email: 'manager@carepilot.example', name: 'Sam Ellis', orgs: [0, 1], roles: ['Compliance Manager', 'Finance Manager'] },
  { email: 'operations@harbour.example', name: 'Jamie Quinn', orgs: [0], roles: ['Operations Manager'] },
 ];
 for (const account of accounts) {
  const user = await client.user.upsert({ where: { email: account.email }, create: { email: account.email, name: account.name, passwordHash }, update: { passwordHash } });
  if (account.roles.includes('Organisation Owner')) {
   const secret = mfaSecrets[account.email] ?? generateMfaSecret();
   mfaSecrets[account.email] = secret;
   await client.user.update({ where: { id: user.id }, data: { mfaSecretEncrypted: encryptMfaSecret(secret) } });
  }
  for (const index of account.orgs) {
   const organisationId = organisations[index].id;
   const membership = await client.organisationMembership.upsert({ where: { organisationId_userId: { organisationId, userId: user.id } }, create: { organisationId, userId: user.id }, update: {} });
   for (const name of account.roles) {
    const role = await client.role.findUniqueOrThrow({ where: { organisationId_name: { organisationId, name } } });
    await client.membershipRole.upsert({ where: { organisationId_membershipId_roleId: { organisationId, membershipId: membership.id, roleId: role.id } }, create: { organisationId, membershipId: membership.id, roleId: role.id }, update: {} });
   }
  }
 }
 writeFileSync('.demo-mfa.json', JSON.stringify(mfaSecrets, null, 2), { mode: 0o600 });
 console.log('Created synthetic workspaces and accounts. Use DEMO_SEED_PASSWORD from your private .env. No external services connected.');
} finally { await client.$disconnect(); }
