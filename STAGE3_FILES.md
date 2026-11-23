# Stage 3 file inventory

Stage 3 source and authorised demo release changes. Generated Prisma/build/test outputs and all private configuration remain ignored. The PRD is unchanged.

## Created

- `scripts/hosted-import-hardening.sql`

- `IMPORTS.md`
- `STAGE3_FILES.md`
- `prisma/migrations/202611240001_import_hub/migration.sql`
- `prisma/migrations/202611240002_import_count_consistency/migration.sql`
- `samples/imports/01-participants.csv`
- `samples/imports/01-participants.xlsx`
- `samples/imports/02-workers.csv`
- `samples/imports/02-workers.xlsx`
- `samples/imports/03-support-at-home-services.csv`
- `samples/imports/03-support-at-home-services.xlsx`
- `samples/imports/04-support-at-home-claims.csv`
- `samples/imports/04-support-at-home-claims.xlsx`
- `samples/imports/05-payment-remittances.csv`
- `samples/imports/05-payment-remittances.xlsx`
- `samples/imports/06-ndis-services.csv`
- `samples/imports/06-ndis-services.xlsx`
- `samples/imports/07-worker-compliance.csv`
- `samples/imports/07-worker-compliance.xlsx`
- `samples/imports/08-missing-columns.csv`
- `samples/imports/08-missing-columns.xlsx`
- `samples/imports/README.md`
- `scripts/generate-import-samples.py`
- `src/app/api/organisations/[organisationId]/imports/[importId]/process/route.ts`
- `src/app/api/organisations/[organisationId]/imports/[importId]/report/route.ts`
- `src/app/api/organisations/[organisationId]/imports/[importId]/route.ts`
- `src/app/api/organisations/[organisationId]/imports/route.ts`
- `src/app/integrations/page.tsx`
- `src/components/integration-hub.tsx`
- `src/lib/imports/catalog.ts`
- `src/lib/imports/validate.ts`
- `src/lib/server/import-files.ts`
- `src/lib/server/imports.ts`
- `tests/fixtures/imports/entity.xlsx`
- `tests/fixtures/imports/expanded.xlsx`
- `tests/fixtures/imports/external.xlsx`
- `tests/fixtures/imports/formula.xlsx`
- `tests/fixtures/imports/macro.xlsx`
- `tests/fixtures/imports/multiple-sheets.xlsx`
- `tests/fixtures/imports/sparse.xlsx`
- `tests/fixtures/imports/traversal.xlsx`
- `tests/integration/imports.test.ts`
- `tests/unit/imports.test.ts`

## Modified

- `DEPLOYMENT.md`

- `.env.example`
- `ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `PROJECT_STATUS.md`
- `README.md`
- `package-lock.json`
- `package.json`
- `prisma/schema.prisma`
- `security_best_practices_report.md`
- `src/app/app/[organisationId]/[[...section]]/page.tsx`
- `src/app/globals.css`
- `src/components/app-shell.tsx`
- `src/lib/permissions.ts`
- `tests/e2e/workspace.spec.ts`
- `tests/integration/isolation.test.ts`
