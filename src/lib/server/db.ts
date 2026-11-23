import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '@/lib/env';
const globalDb = globalThis as unknown as { carepilotDb?: PrismaClient };
export function db() {
  if (!globalDb.carepilotDb) globalDb.carepilotDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }) });
  return globalDb.carepilotDb;
}
