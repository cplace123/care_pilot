-- New tables must opt into runtime access explicitly in their own migrations.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='carepilot_app') THEN
 ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM carepilot_app;
 REVOKE ALL ON "SourceRecord" FROM carepilot_app;
 GRANT SELECT ON "SourceRecord" TO carepilot_app;
END IF; END $$;
