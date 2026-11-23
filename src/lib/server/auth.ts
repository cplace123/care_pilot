import 'server-only';
import { authenticatePublicDemo } from './public-demo-auth';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { db } from './db';
import { getEnv } from '@/lib/env';
import { authenticate, revokeSession, SESSION_SECONDS } from './auth-service';
import { AccessDenied, assertSession, type Identity } from './access';
export function authOptions(): NextAuthOptions {
  return {
    secret: getEnv().NEXTAUTH_SECRET,
    session: { strategy: 'jwt', maxAge: SESSION_SECONDS },
    pages: { signIn: '/login', error: '/login' },
    providers: [Credentials({ name: 'CarePilot', credentials: { email: { type: 'email' }, password: { type: 'password' }, code: { type: 'text' }, demo: { type: 'text' } }, async authorize(credentials) {
      if (credentials?.demo === 'true') {
        try { return await authenticatePublicDemo(db()); }
        catch { console.error('CarePilot demo access unavailable'); return null; }
      }
      const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128), code: z.string().max(6).optional() }).safeParse(credentials);
      if (!parsed.success) return null;
      try { return await authenticate(db(), parsed.data.email, parsed.data.password, parsed.data.code); }
      catch {
        // Auth.js serialises thrown authorize messages into redirect URLs. Never expose database details.
        console.error('CarePilot authentication service unavailable');
        return null;
      }
    } })],
    callbacks: {
      async jwt({ token, user }) { if (user) { token.sub = user.id; token.sessionId = user.sessionId; } return token; },
      async session({ session, token }) {
        session.user.id = ''; session.sessionId = '';
        if (token.sub && token.sessionId) {
          try {
            await db().$transaction(tx => assertSession(tx, { userId: token.sub!, sessionId: token.sessionId! }));
            session.user.id = token.sub; session.sessionId = token.sessionId;
          } catch (error) { if (!(error instanceof AccessDenied)) throw error; }
        }
        if (!session.user.id) { session.user.name = null; session.user.email = null; session.expires = new Date(0).toISOString(); }
        return session;
      },
      async redirect({ url, baseUrl }) { try { const target = new URL(url, baseUrl); if (target.origin === new URL(baseUrl).origin) return target.href; } catch {} return baseUrl; },
    },
    events: { async signOut({ token }) { if (token?.sessionId && token.sub) await revokeSession(db(), token.sessionId, token.sub); } },
  };
}
export async function requireIdentity(): Promise<Identity> {
  const session = await getServerSession(authOptions());
  if (!session?.user?.id || !session.sessionId) redirect('/login');
  const identity = { userId: session.user.id, sessionId: session.sessionId };
  try { await db().$transaction(tx => assertSession(tx, identity)); }
  catch (error) { if (error instanceof Error && error.message === 'Access denied') redirect('/login'); throw error; }
  return identity;
}
