import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) throw new Error('.env already exists; it has been preserved.');
const random = () => randomBytes(32).toString('hex');
const owner = random(), runtime = random();
const contents = `# Private, synthetic-only local development settings. Never commit this file.
DATABASE_URL=postgresql://carepilot_app:${runtime}@127.0.0.1:55432/carepilot
DIRECT_DATABASE_URL=postgresql://postgres:${owner}@127.0.0.1:55432/carepilot
POSTGRES_PASSWORD=${owner}
RUNTIME_DB_PASSWORD=${runtime}
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=${random()}
AUTH_ENCRYPTION_KEY=${random()}
DEMO_SEED_PASSWORD=${random()}
ALLOW_DEMO_SEED=true
`;
writeFileSync('.env', contents, { mode: 0o600, flag: 'wx' });
console.log('Created private local .env with freshly generated secrets. No credentials printed.');
