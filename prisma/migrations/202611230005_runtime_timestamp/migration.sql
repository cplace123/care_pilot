-- Prisma updates updatedAt when atomically consuming an MFA code.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='carepilot_app') THEN
 GRANT UPDATE ("updatedAt") ON "User" TO carepilot_app;
END IF; END $$;
