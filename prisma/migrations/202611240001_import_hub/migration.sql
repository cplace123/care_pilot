-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportStatus" ADD VALUE 'UPLOADED';
ALTER TYPE "ImportStatus" ADD VALUE 'VALIDATING';
ALTER TYPE "ImportStatus" ADD VALUE 'MAPPING_REQUIRED';
ALTER TYPE "ImportStatus" ADD VALUE 'READY';
ALTER TYPE "ImportStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "ImportStatus" ADD VALUE 'COMPLETED_WITH_ERRORS';

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "allowVersions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dataType" VARCHAR(80),
ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'ISO',
ADD COLUMN     "fileId" UUID,
ADD COLUMN     "initiatedById" UUID,
ADD COLUMN     "mapping" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "processedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejectedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "successCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unchangedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SourceRecord" ADD COLUMN     "fingerprint" CHAR(64);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "format" VARCHAR(4) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "encryptedContent" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "dataType" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "mapping" JSONB NOT NULL,
    "dateFormat" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "row" INTEGER NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "field" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_organisationId_connectionId_id_key" ON "ImportFile"("organisationId", "connectionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_organisationId_id_key" ON "ImportFile"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_organisationId_connectionId_checksum_key" ON "ImportFile"("organisationId", "connectionId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_organisationId_provider_dataType_name_key" ON "ImportMapping"("organisationId", "provider", "dataType", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ImportError_organisationId_importJobId_row_field_code_key" ON "ImportError"("organisationId", "importJobId", "row", "field", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_organisationId_id_key" ON "ImportJob"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_organisationId_fileId_key" ON "ImportJob"("organisationId", "fileId");

-- CreateIndex
CREATE INDEX "SourceRecord_organisationId_connectionId_sourceType_fingerp_idx" ON "SourceRecord"("organisationId", "connectionId", "sourceType", "fingerprint");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_organisationId_connectionId_fileId_fkey" FOREIGN KEY ("organisationId", "connectionId", "fileId") REFERENCES "ImportFile"("organisationId", "connectionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_organisationId_connectionId_fkey" FOREIGN KEY ("organisationId", "connectionId") REFERENCES "IntegrationConnection"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_organisationId_importJobId_fkey" FOREIGN KEY ("organisationId", "importJobId") REFERENCES "ImportJob"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing rows remain intact; the provider allowlist is only expanded.
ALTER TABLE "IntegrationConnection" DROP CONSTRAINT known_provider;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT known_provider CHECK (provider IN ('ShiftCare','AlayaCare','Visualcare','Lumary','CareMaster','Brevity','Xero','MYOB','CSV','Excel'));
INSERT INTO "Permission" (key, description) VALUES ('imports.read','View import history, previews and validation reports'), ('imports.write','Upload, map and process imports');
INSERT INTO "RolePermission" ("organisationId","roleId","permissionKey") SELECT r."organisationId",r.id,p.key FROM "Role" r CROSS JOIN "Permission" p WHERE r.name IN ('Organisation Owner','Administrator') AND p.key IN ('imports.read','imports.write');
CREATE FUNCTION import_allowed(tenant uuid, permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
 SELECT tenant_allowed(tenant) AND EXISTS (
 SELECT 1 FROM "Membership" m JOIN "MembershipRole" mr ON mr."organisationId"=m."organisationId" AND mr."membershipId"=m.id
 JOIN "RolePermission" rp ON rp."organisationId"=mr."organisationId" AND rp."roleId"=mr."roleId"
 WHERE m."organisationId"=tenant AND m."userId"::text=current_setting('app.user_id',true) AND m.active AND rp."permissionKey"=permission)
$$;
REVOKE ALL ON FUNCTION import_allowed(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION import_allowed(uuid,text) TO carepilot_app;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ImportFile','ImportMapping','ImportError'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY import_read ON %I FOR SELECT USING (import_allowed("organisationId",''imports.read''))',t);
  EXECUTE format('CREATE POLICY import_insert ON %I FOR INSERT WITH CHECK (import_allowed("organisationId",''imports.write''))',t);
 END LOOP;
END $$;
CREATE POLICY mapping_update ON "ImportMapping" FOR UPDATE USING (import_allowed("organisationId",'imports.write')) WITH CHECK (import_allowed("organisationId",'imports.write'));
CREATE POLICY import_job_insert ON "ImportJob" AS RESTRICTIVE FOR INSERT WITH CHECK (import_allowed("organisationId",'imports.write') AND "initiatedById"::text=current_setting('app.user_id',true));
CREATE POLICY import_job_update ON "ImportJob" AS RESTRICTIVE FOR UPDATE USING (import_allowed("organisationId",'imports.write')) WITH CHECK (import_allowed("organisationId",'imports.write'));
CREATE POLICY source_insert ON "SourceRecord" AS RESTRICTIVE FOR INSERT WITH CHECK (import_allowed("organisationId",'imports.write'));
CREATE POLICY file_actor ON "ImportFile" AS RESTRICTIVE FOR INSERT WITH CHECK ("uploadedById"::text=current_setting('app.user_id',true));
GRANT SELECT,INSERT ON "ImportFile","ImportMapping","ImportError" TO carepilot_app;
GRANT UPDATE (mapping,"dateFormat","updatedAt") ON "ImportMapping" TO carepilot_app;
GRANT INSERT ON "ImportJob","SourceRecord" TO carepilot_app;
GRANT UPDATE (status,mapping,"dateFormat","allowVersions","processedCount","successCount","rejectedCount","unchangedCount","updatedCount","recordCount","errorCode","completedAt","updatedAt") ON "ImportJob" TO carepilot_app;
GRANT INSERT (id,"organisationId",provider,"updatedAt") ON "IntegrationConnection" TO carepilot_app;
CREATE POLICY connection_insert ON "IntegrationConnection" AS RESTRICTIVE FOR INSERT WITH CHECK (import_allowed("organisationId",'imports.write') AND status='NOT_CONNECTED' AND "readOnly" AND "credentialReference" IS NULL);
ALTER TABLE "ImportFile" ADD CONSTRAINT file_bounds CHECK ("byteSize" BETWEEN 1 AND 4194304 AND octet_length("encryptedContent")="byteSize"+28 AND checksum ~ '^[0-9a-f]{64}$' AND format IN ('csv','xlsx'));
ALTER TABLE "ImportJob" ADD CONSTRAINT import_counts CHECK ("processedCount">=0 AND "processedCount"<="recordCount" AND "successCount">=0 AND "rejectedCount">=0 AND "unchangedCount">=0 AND "updatedCount">=0);
ALTER TABLE "ImportJob" ADD CONSTRAINT mapping_object CHECK (jsonb_typeof(mapping)='object' AND "dateFormat" IN ('ISO','AU'));
ALTER TABLE "ImportError" ADD CONSTRAINT error_row CHECK (row>0);
ALTER TABLE "SourceRecord" ADD CONSTRAINT source_fingerprint CHECK (fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{64}$');
CREATE TRIGGER immutable_sources BEFORE UPDATE OR DELETE ON "SourceRecord" FOR EACH ROW EXECUTE FUNCTION prevent_activity_mutation();
CREATE TRIGGER immutable_sources_truncate BEFORE TRUNCATE ON "SourceRecord" FOR EACH STATEMENT EXECUTE FUNCTION prevent_activity_mutation();
-- Protected validation files are immutable; no plaintext original filenames are stored.
REVOKE ALL ON "ImportFile","ImportMapping","ImportError" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON "ImportFile","ImportMapping","ImportError" FROM %I',r); END IF;
 END LOOP;
END $$;
