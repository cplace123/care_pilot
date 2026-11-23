-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "IntegrationConnection" ADD COLUMN     "credentialReference" VARCHAR(200),
ADD COLUMN     "displayName" VARCHAR(120),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ActivityEvent" ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "organisationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "sourceType" VARCHAR(80) NOT NULL,
    "externalId" VARCHAR(200) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceRecord_organisationId_connectionId_sourceType_externa_idx" ON "SourceRecord"("organisationId", "connectionId", "sourceType", "externalId");

-- CreateIndex
CREATE INDEX "SourceRecord_organisationId_createdAt_idx" ON "SourceRecord"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_organisationId_importJobId_sourceType_external_key" ON "SourceRecord"("organisationId", "importJobId", "sourceType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_organisationId_connectionId_id_key" ON "ImportJob"("organisationId", "connectionId", "id");

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_organisationId_connectionId_importJobId_fkey" FOREIGN KEY ("organisationId", "connectionId", "importJobId") REFERENCES "ImportJob"("organisationId", "connectionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Context alone is insufficient: verify an active membership and account too.
DROP POLICY membership_discovery ON "Membership";
CREATE POLICY membership_discovery ON "Membership" FOR SELECT USING (
 "userId"::text = current_setting('app.user_id', true)
);
CREATE FUNCTION tenant_allowed(tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
 SELECT tenant::text = current_setting('app.organisation_id', true)
 AND EXISTS (SELECT 1 FROM "Membership" m JOIN "User" u ON u.id = m."userId"
 WHERE m."organisationId" = tenant AND m."userId"::text = current_setting('app.user_id', true) AND m.active AND u.active)
$$;
DROP POLICY organisation_access ON "Organisation";
CREATE POLICY organisation_access ON "Organisation" FOR SELECT USING (
 EXISTS (SELECT 1 FROM "Membership" m JOIN "User" u ON u.id = m."userId"
 WHERE m."organisationId" = "Organisation".id AND m."userId"::text = current_setting('app.user_id', true) AND m.active AND u.active)
);
CREATE POLICY organisation_update ON "Organisation" FOR UPDATE USING (tenant_allowed(id)) WITH CHECK (tenant_allowed(id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Role','RolePermission','MembershipRole','IntegrationConnection','ImportJob','ActivityEvent'] LOOP
 EXECUTE format('DROP POLICY tenant_isolation ON %I',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_allowed("organisationId")) WITH CHECK (tenant_allowed("organisationId"))',t);
 END LOOP;
END $$;
-- Unattributed failures belong to the security log, never to an arbitrary tenant.
CREATE POLICY security_event_insert ON "ActivityEvent" FOR INSERT WITH CHECK (
 "organisationId" IS NULL AND "actorId" IS NULL AND action IN ('auth.failed','auth.throttled','access.denied')
);
ALTER TABLE "SourceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SourceRecord" USING (tenant_allowed("organisationId")) WITH CHECK (tenant_allowed("organisationId"));
ALTER TABLE "SourceRecord" ADD CONSTRAINT source_content_hash CHECK ("contentHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "SourceRecord" ADD CONSTRAINT source_identifiers CHECK (length(trim("externalId")) > 0 AND length(trim("sourceType")) > 0);
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT known_provider CHECK (provider IN ('ShiftCare','AlayaCare','Visualcare','Lumary','Xero','MYOB'));
-- This stores only an opaque future secret-manager reference, never credentials.
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT credential_reference CHECK ("credentialReference" IS NULL OR "credentialReference" ~ '^secret://[a-zA-Z0-9/_-]{1,180}$');
ALTER TABLE "ActivityEvent" ADD CONSTRAINT audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192);
CREATE TRIGGER activity_no_truncate BEFORE TRUNCATE ON "ActivityEvent" FOR EACH STATEMENT EXECUTE FUNCTION prevent_activity_mutation();
-- Trigger-generated audit records commit atomically with the underlying change.
-- Metadata contains identifiers/operation only; never passwords, payloads or secrets.
CREATE FUNCTION audit_foundation_change() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE row_data jsonb; tenant uuid; verb text; resource text;
BEGIN
 IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
 IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
 tenant := (CASE WHEN TG_TABLE_NAME = 'Organisation' THEN row_data->>'id' ELSE row_data->>'organisationId' END)::uuid;
 verb := CASE TG_TABLE_NAME WHEN 'Organisation' THEN 'organisation.configuration_changed'
 WHEN 'IntegrationConnection' THEN 'integration.configuration_changed'
 WHEN 'ImportJob' THEN 'import.changed' WHEN 'SourceRecord' THEN 'import.source_recorded'
 ELSE 'permission.changed' END;
 resource := COALESCE(row_data->>'id',row_data->>'roleId');
 INSERT INTO "ActivityEvent" (id,"organisationId","actorId",action,"resourceId",metadata,"createdAt")
 VALUES (gen_random_uuid(),tenant,NULLIF(current_setting('app.user_id',true),'')::uuid,verb,resource,
 jsonb_build_object('table',TG_TABLE_NAME,'operation',TG_OP,'actorType',CASE WHEN NULLIF(current_setting('app.user_id',true),'') IS NULL THEN 'system' ELSE 'user' END),clock_timestamp());
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Organisation','Membership','Role','RolePermission','MembershipRole','IntegrationConnection','ImportJob','SourceRecord'] LOOP
 EXECUTE format('CREATE TRIGGER foundation_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_foundation_change()',t);
 END LOOP;
END $$;
INSERT INTO "Permission" (key,description,"updatedAt") VALUES
 ('organisation.configure','Change organisation settings',now()),
 ('integrations.configure','Change integration display settings',now()),
 ('sources.read','View source record metadata',now()) ON CONFLICT (key) DO NOTHING;
INSERT INTO "RolePermission" ("organisationId","roleId","permissionKey")
 SELECT r."organisationId", r.id, p.key FROM "Role" r CROSS JOIN "Permission" p
 WHERE r.name IN ('Organisation Owner','Administrator') AND p.key IN ('organisation.configure','integrations.configure','sources.read')
 ON CONFLICT DO NOTHING;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='carepilot_app') THEN
 GRANT SELECT ON "SourceRecord" TO carepilot_app;
 GRANT UPDATE (name,"updatedAt") ON "Organisation" TO carepilot_app;
 GRANT UPDATE ("displayName","updatedAt") ON "IntegrationConnection" TO carepilot_app;
END IF; END $$;
