import NextAuth from 'next-auth';
import { authOptions } from '@/lib/server/auth';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
type Context = { params: Promise<{ nextauth: string[] }> };
async function handler(request: NextRequest, context: Context) {
  return NextAuth(authOptions())(request, { params: await context.params });
}
export { handler as GET, handler as POST };
