import { describe, it, expect, vi } from 'vitest';
import { databaseConfig } from '@/lib/server/database-config';
import type { CredentialsConfig } from 'next-auth/providers/credentials';
const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/auth-service', () => ({ authenticate, revokeSession: vi.fn(), SESSION_SECONDS: 28800 }));
vi.mock('@/lib/server/db', () => ({ db: () => ({}) }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ NEXTAUTH_SECRET: 'synthetic'.repeat(8) }) }));
import { authOptions } from '@/lib/server/auth';
describe('hosted security boundaries', () => {
 it('does not send backend errors through the credentials callback', async () => {
  authenticate.mockRejectedValueOnce(new Error('private database host and query details'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
   const provider = authOptions().providers[0] as CredentialsConfig;
   const authorize = provider.options?.authorize ?? provider.authorize;
   expect(await authorize({ email: 'demo@synthetic.example', password: 'synthetic password' }, {})).toBeNull();
   expect(log).toHaveBeenCalledWith('CarePilot authentication service unavailable');
  } finally { log.mockRestore(); }
 });
 it('keeps certificate verification on and trusts the published Supabase CA', () => {
  const config = databaseConfig({ DATABASE_URL: 'postgresql://carepilot_app.aaaaaaaaaaaaaaaaaaaa:synthetic@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=verify-full', DATABASE_PROJECT_REF: 'a'.repeat(20), NEXTAUTH_URL: 'https://demo.example', NEXTAUTH_SECRET: 'x'.repeat(40), AUTH_ENCRYPTION_KEY: 'a'.repeat(64), NODE_ENV: 'production' });
  expect(config.connectionString).toBeUndefined();
  expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
  expect(config.max).toBe(3); expect(config.host).toBe('aws-1-ap-southeast-2.pooler.supabase.com');
 });
});
