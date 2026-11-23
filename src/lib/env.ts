import { z } from 'zod';
const postgresUrl = z.string().url().refine(v => ['postgres:', 'postgresql:'].includes(new URL(v).protocol), 'Use a PostgreSQL URL');
export const envSchema = z.object({
  DATABASE_URL: postgresUrl,
  AUTH_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'Generate a 32-byte hex encryption key'),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32).refine(v => !v.startsWith('REPLACE'), 'Generate a fresh secret'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
export function getEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Invalid environment configuration: ' + parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; '));
  const appUrl = new URL(parsed.data.NEXTAUTH_URL);
  const localBuildTest = process.env.LOCAL_PRODUCTION_TEST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname);
  if (parsed.data.NODE_ENV === 'production' && appUrl.protocol !== 'https:' && !localBuildTest) throw new Error('Production requires HTTPS');
  if (new URL(parsed.data.DATABASE_URL).username !== 'carepilot_app') throw new Error('DATABASE_URL must use the restricted carepilot_app role');
  return parsed.data;
}
