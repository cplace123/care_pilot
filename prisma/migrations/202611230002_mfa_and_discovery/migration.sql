ALTER TABLE "User" ADD COLUMN "mfaSecretEncrypted" TEXT, ADD COLUMN "mfaLastStep" BIGINT;
DROP POLICY organisation_access ON "Organisation";
CREATE POLICY organisation_access ON "Organisation" FOR SELECT USING (
  id::text = current_setting('app.organisation_id', true)
  OR EXISTS (SELECT 1 FROM "Membership" m WHERE m."organisationId" = "Organisation".id AND m."userId"::text = current_setting('app.user_id', true) AND m.active)
);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carepilot_app') THEN
  GRANT UPDATE ("mfaLastStep") ON "User" TO carepilot_app;
 END IF;
END $$;
