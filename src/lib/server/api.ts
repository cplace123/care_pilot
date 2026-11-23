import 'server-only';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { PermissionKey } from '@/lib/permissions';
import { getEnv } from '@/lib/env';
import { authOptions } from './auth';
import { db } from './db';
import { AccessDenied, assertSession, withOrganisation, type Identity } from './access';

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function apiIdentity(): Promise<Identity | null> {
  const session = await getServerSession(authOptions());
  return session?.user?.id && session.sessionId ? { userId: session.user.id, sessionId: session.sessionId } : null;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } });
}
// Dependencies are injectable to test the real boundary with PostgreSQL and no mock authorisation.
export async function tenantApi(organisationId: string, permission: PermissionKey,
  work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  dependencies: { client: PrismaClient; identity: () => Promise<Identity | null> } = { client: db(), identity: apiIdentity }) {
  try {
    const identity = await dependencies.identity();
    if (!identity) return json({ error: 'Authentication required' }, 401);
    try { await dependencies.client.$transaction(tx => assertSession(tx, identity)); }
    catch (error) { if (error instanceof AccessDenied) return json({ error: 'Authentication required' }, 401); throw error; }
    if (!z.uuid().safeParse(organisationId).success) return json({ error: 'Invalid request' }, 400);
    return json(await withOrganisation(dependencies.client, identity, organisationId, permission, work));
  } catch (error) {
    if (error instanceof AccessDenied) return json({ error: 'Access denied' }, 403);
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: 'Invalid request' }, 400);
    return json({ error: 'Request could not be completed' }, 500);
  }
}
export async function readMutation(request: Request): Promise<unknown> {
  // Cookie-authenticated mutation: require exact configured origin, not proxy/Host input.
  if (request.headers.get('origin') !== new URL(getEnv().NEXTAUTH_URL).origin) throw new RequestError(403, 'Access denied');
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new RequestError(415, 'JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Invalid request');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new RequestError(413, 'Request too large'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, 'Invalid request'); }
  finally { reader.releaseLock(); }
}
