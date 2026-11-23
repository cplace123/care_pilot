import 'server-only';
import { rootCertificates } from 'node:tls';
import type { PoolConfig } from 'pg';
import type { getEnv } from '@/lib/env';
import { supabaseCa } from './supabase-ca';
export function databaseConfig(env: ReturnType<typeof getEnv>): PoolConfig {
  const limits = { max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 };
  if (!env.DATABASE_PROJECT_REF) return { ...limits, connectionString: env.DATABASE_URL };
  const url = new URL(env.DATABASE_URL);
  // Explicit fields prevent pg connection-string options from replacing the verified TLS configuration.
  return { ...limits, host: url.hostname, port: Number(url.port || 6543), database: url.pathname.slice(1),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true, ca: [...rootCertificates, supabaseCa] } };
}
