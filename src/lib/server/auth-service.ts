import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { digest, verifyPassword } from '@/lib/password';
import { decryptMfaSecret, verifyTotp } from '@/lib/mfa';
import { setContext } from './access';
import { recordSecurityEvent } from './security-events';
export const SESSION_SECONDS = 8 * 60 * 60;
async function appendAuthEvent(tx: Prisma.TransactionClient, userId: string, action: 'auth.login' | 'auth.logout', sessionId: string) {
  await setContext(tx, userId);
  const memberships = await tx.organisationMembership.findMany({ where: { userId, active: true, user: { active: true } } });
  if (!memberships.length) {
    await tx.activityEvent.createMany({ data: { actorId: userId, action, resourceId: digest(sessionId), metadata: { outcome: 'success', actorType: 'user' } } });
  }
  for (const membership of memberships) {
    await setContext(tx, userId, membership.organisationId);
    await tx.activityEvent.create({ data: { organisationId: membership.organisationId, actorId: userId, action, resourceId: digest(sessionId), metadata: { outcome: 'success', actorType: 'user' } } });
  }
}
export async function recordAuthEvent(client: PrismaClient, userId: string, action: 'auth.login' | 'auth.logout', sessionId: string) {
  await client.$transaction(tx => appendAuthEvent(tx, userId, action, sessionId));
}
export async function authenticate(client: PrismaClient, email: string, password: string, code?: string) {
  const normalised = email.trim().toLowerCase();
  const key = digest(normalised);
  const attempts = await client.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginThrottle" ("key", "attempts", "resetAt") VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginThrottle"."resetAt" <= NOW() THEN 1 ELSE "LoginThrottle"."attempts" + 1 END,
      "resetAt" = CASE WHEN "LoginThrottle"."resetAt" <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE "LoginThrottle"."resetAt" END
    RETURNING "attempts"`;
  if (attempts[0].attempts > 10) { await recordSecurityEvent(client, 'auth.throttled'); return null; }
  const denied = async () => { await recordSecurityEvent(client, 'auth.failed'); return null; };
  const user = await client.user.findUnique({ where: { email: normalised } });
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!valid || !user?.active) return denied();
  const privileged = await client.$transaction(async tx => {
    await setContext(tx, user.id);
    const memberships = await tx.organisationMembership.findMany({ where: { userId: user.id, active: true } });
    for (const membership of memberships) {
      await setContext(tx, user.id, membership.organisationId);
      const grants = await tx.membershipRole.findMany({ where: { organisationId: membership.organisationId, membershipId: membership.id }, include: { role: true } });
      if (grants.some(g => ['Organisation Owner', 'Administrator'].includes(g.role.name))) return true;
    }
    return false;
  });
  if (privileged && !user.mfaSecretEncrypted) return denied();
  if (user.mfaSecretEncrypted) {
    const step = verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code ?? '');
    if (step === null) return denied();
    const consumed = await client.user.updateMany({ where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: BigInt(step) } }] }, data: { mfaLastStep: BigInt(step) } });
    if (consumed.count !== 1) return denied();
  }
  const sessionId = digest(randomBytes(32).toString('hex'));
  await client.authSession.create({ data: { id: sessionId, userId: user.id, mfaVerified: Boolean(user.mfaSecretEncrypted), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  try { await recordAuthEvent(client, user.id, 'auth.login', sessionId); }
  catch (error) { await client.authSession.delete({ where: { id: sessionId } }); throw error; }
  return { id: user.id, name: user.name, email: user.email, sessionId };
}
export async function revokeSession(client: PrismaClient, sessionId: string, userId: string) {
  await client.$transaction(async tx => {
    const deleted = await tx.authSession.deleteMany({ where: { id: sessionId, userId } });
    if (deleted.count) await appendAuthEvent(tx, userId, 'auth.logout', sessionId);
  });
}
