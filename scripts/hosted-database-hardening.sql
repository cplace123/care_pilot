-- Supabase-only: run as the trusted migration owner after the eight Prisma migrations.
-- Provision carepilot_app separately with a fresh SCRAM password, never commit credentials.
-- These settings keep Auth.js as the only authentication system; no browser Data API access.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION tenant_allowed(uuid), prevent_activity_mutation(), audit_foundation_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION tenant_allowed(uuid), prevent_activity_mutation(), audit_foundation_change() TO carepilot_app;
ALTER FUNCTION prevent_activity_mutation() SET search_path = public, pg_temp;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['User','Permission','AuthSession','LoginThrottle'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='internal_authentication') THEN
   EXECUTE format('CREATE POLICY internal_authentication ON %I TO carepilot_app USING (true) WITH CHECK (true)',t);
  END IF;
 END LOOP;
END $$;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" FORCE ROW LEVEL SECURITY;
-- No policy on migration history is intentional: only migration-owner access.
