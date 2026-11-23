import 'server-only';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { digest } from '@/lib/password';
import { setContext } from './access';
import { PUBLIC_DEMO_EMAIL, publicDemoConfig, safePublicDemoGrants } from './public-demo-config';
export async function authenticatePublicDemo(client: PrismaClient) {
 const config = publicDemoConfig();
 if (!config) return null;
 // Shared synthetic account only. A bounded admission window limits public session churn.
 const throttleKey = digest(`public-demo:${config.userId}`);
 const [attempt] = await client.$queryRaw<{ attempts: number }[]>`
 INSERT INTO "LoginThrottle" (key,attempts,"resetAt") VALUES (${throttleKey},1,NOW()+INTERVAL '15 minutes')
 ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN "LoginThrottle"."resetAt"<=NOW() THEN 1 ELSE "LoginThrottle".attempts+1 END,
 "resetAt"=CASE WHEN "LoginThrottle"."resetAt"<=NOW() THEN NOW()+INTERVAL '15 minutes' ELSE "LoginThrottle"."resetAt" END RETURNING attempts`;
 if (attempt.attempts > 100) return null;
 return client.$transaction(async tx => {
  const user = await tx.user.findFirst({ where: { id: config.userId, email: PUBLIC_DEMO_EMAIL, active: true, mfaSecretEncrypted: null } });
  if (!user) return null;
  await setContext(tx, user.id, config.organisationId);
  const membership = await tx.organisationMembership.findUnique({ where: { organisationId_userId: { organisationId: config.organisationId, userId: user.id } }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  const roles = membership?.roles.map(m => m.role.name) ?? [];
  const permissions = membership?.roles.flatMap(m => m.role.permissions.map(p => p.permissionKey)) ?? [];
  if (!membership?.active || !safePublicDemoGrants(roles,permissions)) return null;
  const sessionId = 'public-demo:' + digest(randomBytes(32).toString('hex'));
  await tx.authSession.create({ data: { id: sessionId, userId: user.id, mfaVerified: false, expiresAt: new Date(Math.min(Date.now()+3600000,config.expiresAt.getTime())) } });
  await tx.activityEvent.create({ data: { organisationId: config.organisationId, actorId: user.id, action: 'auth.public_demo_started', resourceId: digest(sessionId), metadata: { actorType: 'public_demo', outcome: 'success' } } });
  return { id: user.id, name: user.name, email: user.email, sessionId };
 });
}
