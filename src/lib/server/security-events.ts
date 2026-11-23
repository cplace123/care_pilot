import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
// Unknown identities/tenants must never be attributed to a victim organisation.
// No submitted email, password, MFA code, session token or request body is logged.
export async function recordSecurityEvent(client: PrismaClient, action: 'auth.failed' | 'auth.throttled' | 'access.denied') {
  await client.activityEvent.createMany({ data: { action, metadata: { outcome: 'denied', actorType: 'unverified' } } });
}
