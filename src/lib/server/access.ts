import 'server-only';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { hasPermission, type PermissionKey } from '@/lib/permissions';
import { recordSecurityEvent } from './security-events';
export class AccessDenied extends Error { constructor() { super('Access denied'); } }
export type Identity = { userId: string; sessionId: string };
export async function assertSession(tx: Prisma.TransactionClient, identity: Identity) {
  const session = await tx.authSession.findFirst({ where: { id: identity.sessionId, userId: identity.userId, expiresAt: { gt: new Date() }, user: { active: true } } });
  if (!session) throw new AccessDenied();
  return session;
}
export async function setContext(tx: Prisma.TransactionClient, userId: string, organisationId = '') {
  await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true), set_config('app.organisation_id', ${organisationId}, true)`;
}
export async function listOrganisations(client: PrismaClient, identity: Identity) {
  return client.$transaction(async tx => {
    await assertSession(tx, identity);
    await setContext(tx, identity.userId);
    return tx.organisationMembership.findMany({ where: { userId: identity.userId, active: true }, select: { organisation: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
  });
}
export async function withOrganisation<T>(client: PrismaClient, identity: Identity, organisationId: string, permission: PermissionKey, work: (tx: Prisma.TransactionClient, access: { permissions: string[]; roles: string[] }) => Promise<T>) {
  return client.$transaction(async tx => {
    const session = await assertSession(tx, identity);
    await setContext(tx, identity.userId, organisationId);
    const membership = await tx.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId, userId: identity.userId } },
      include: { roles: { include: { role: { include: { permissions: true } } } } },
    });
    if (!membership?.active) throw new AccessDenied();
    if (membership.roles.some(m => ['Organisation Owner', 'Administrator'].includes(m.role.name)) && !session.mfaVerified) throw new AccessDenied();
    const permissions = [...new Set(membership.roles.flatMap(m => m.role.permissions.map(p => p.permissionKey)))];
    if (!hasPermission(permissions, permission)) throw new AccessDenied();
    return work(tx, { permissions, roles: membership.roles.map(m => m.role.name) });
  }).catch(async error => {
    if (error instanceof AccessDenied) await recordSecurityEvent(client, 'access.denied');
    throw error;
  });
}
