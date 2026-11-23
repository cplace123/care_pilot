-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "organisationId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("organisationId","roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "MembershipRole" (
    "organisationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("organisationId","membershipId","roleId")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organisationId_userId_key" ON "Membership"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organisationId_id_key" ON "Membership"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organisationId_name_key" ON "Role"("organisationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organisationId_id_key" ON "Role"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_organisationId_id_key" ON "IntegrationConnection"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_organisationId_provider_key" ON "IntegrationConnection"("organisationId", "provider");

-- CreateIndex
CREATE INDEX "ImportJob_organisationId_createdAt_idx" ON "ImportJob"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_organisationId_idempotencyKey_key" ON "ImportJob"("organisationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ActivityEvent_organisationId_createdAt_idx" ON "ActivityEvent"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_organisationId_roleId_fkey" FOREIGN KEY ("organisationId", "roleId") REFERENCES "Role"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_organisationId_membershipId_fkey" FOREIGN KEY ("organisationId", "membershipId") REFERENCES "Membership"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_organisationId_roleId_fkey" FOREIGN KEY ("organisationId", "roleId") REFERENCES "Role"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_organisationId_connectionId_fkey" FOREIGN KEY ("organisationId", "connectionId") REFERENCES "IntegrationConnection"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defence in depth: context is set transaction-locally by the server, never by a client request.
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
CREATE POLICY organisation_access ON "Organisation" FOR SELECT USING (
  id::text = current_setting('app.organisation_id', true)
  OR EXISTS (SELECT 1 FROM "Membership" m WHERE m."organisationId" = id AND m."userId"::text = current_setting('app.user_id', true) AND m.active)
);
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_discovery ON "Membership" FOR SELECT USING (
  "userId"::text = current_setting('app.user_id', true)
  OR "organisationId"::text = current_setting('app.organisation_id', true)
);

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role" USING ("organisationId"::text = current_setting('app.organisation_id', true)) WITH CHECK ("organisationId"::text = current_setting('app.organisation_id', true));

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RolePermission" USING ("organisationId"::text = current_setting('app.organisation_id', true)) WITH CHECK ("organisationId"::text = current_setting('app.organisation_id', true));

ALTER TABLE "MembershipRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MembershipRole" USING ("organisationId"::text = current_setting('app.organisation_id', true)) WITH CHECK ("organisationId"::text = current_setting('app.organisation_id', true));

ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationConnection" USING ("organisationId"::text = current_setting('app.organisation_id', true)) WITH CHECK ("organisationId"::text = current_setting('app.organisation_id', true));

ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ImportJob" USING ("organisationId"::text = current_setting('app.organisation_id', true)) WITH CHECK ("organisationId"::text = current_setting('app.organisation_id', true));

ALTER TABLE "ActivityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActivityEvent" USING ("organisationId"::text = current_setting('app.organisation_id', true)) WITH CHECK ("organisationId"::text = current_setting('app.organisation_id', true));

-- Critical history is append-only, including for administrative writes.
CREATE FUNCTION prevent_activity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Activity events are append-only'; END;
$$;
CREATE TRIGGER activity_immutable BEFORE UPDATE OR DELETE ON "ActivityEvent" FOR EACH ROW EXECUTE FUNCTION prevent_activity_mutation();
ALTER TABLE "ImportJob" ADD CONSTRAINT nonnegative_record_count CHECK ("recordCount" >= 0);
-- Runtime credentials must be distinct from migration credentials. Local setup provisions this role.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carepilot_app') THEN
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM carepilot_app;
   GRANT SELECT ON "Organisation", "Membership", "Role", "Permission", "RolePermission", "MembershipRole", "IntegrationConnection", "ImportJob", "ActivityEvent", "User" TO carepilot_app;
   GRANT INSERT ON "ActivityEvent" TO carepilot_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON "AuthSession", "LoginThrottle" TO carepilot_app;
 END IF;
END $$;
