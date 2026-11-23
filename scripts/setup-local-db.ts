import 'dotenv/config';
import pg from 'pg';
const url = new URL(process.env.DIRECT_DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/carepilot') throw new Error('This setup command is restricted to the local carepilot database');
const password = process.env.RUNTIME_DB_PASSWORD;
if (!password || password.length < 24 || password.startsWith('REPLACE')) throw new Error('Generate RUNTIME_DB_PASSWORD with at least 24 characters');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
 const found = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'carepilot_app'");
 if (!found.rowCount) await client.query(`CREATE ROLE carepilot_app LOGIN PASSWORD '${password.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await client.query('GRANT CONNECT ON DATABASE carepilot TO carepilot_app; GRANT USAGE ON SCHEMA public TO carepilot_app');
 await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM carepilot_app');
 console.log('Local runtime database role is ready.');
} finally { await client.end(); }
