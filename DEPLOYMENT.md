# CarePilot synthetic demo deployment

The user approved a free Vercel demo and a separate Supabase database, then requested Sydney. The user subsequently approved committing, pushing, merging and deploying Stage 3 to the same synthetic demo. Real provider data and paid resources remain outside scope.

## Resources

- Supabase organisation: CarePilot (`qawgwyfgryxafwodcbfh`), Free plan.
- Demo project: CarePilot Demo (`anbrbvbmvpyfocgggqgf`), Sydney / `ap-southeast-2`.
- The previous Seoul project was left untouched.
- Vercel team: `hire-expectations-projects`; project: `carepilot-demo` (`prj_LvqnpVEBf2DXcJFDzabjRCg0kOKg`).
- Functions are configured for Sydney (`syd1`), Node.js 24.
- Vercel Git linking returned `repo_no_access`. A source snapshot deployment is prepared; automatic Git deployments require a separate Vercel/GitHub connection fix.

## Connection and secret handling

Use the project's shared pooler endpoint with PostgreSQL database `postgres`, port 6543 and `sslmode=verify-full`. The runtime username is `carepilot_app.<project-ref>` and `DATABASE_PROJECT_REF` must match. Validation rejects a privileged username, an unexpected host or TLS verification being disabled. The database driver pool is bounded to three connections per instance.

Create fresh runtime database, Auth.js and MFA encryption secrets for hosting; never reuse or upload local development secrets. Vercel stores the runtime variables as sensitive/encrypted values. Migration-owner credentials are not supplied to the app. Demo account credentials remain in a private ignored local handover file.

The deployment source package excludes `.env*`, MFA files, the PRD, local skill files, build outputs, local database contents and test artifacts. Auth.js login, MFA, CSRF checks and server-side tenant/permission enforcement remain enabled.

## Database setup completed

The empty Sydney database received the eight existing Prisma migrations, with checksummed entries recorded in `_prisma_migrations`, plus Supabase-specific hardening equivalent to `scripts/hosted-database-hardening.sql`. The app role is non-superuser/non-BYPASSRLS and cannot create roles. Public, anonymous, authenticated and service API roles have no table access. All application tables have RLS enabled; migration history intentionally has no public policy.

Synthetic seeding created two fictional organisations, three demo users, current role permissions and twelve disconnected integration records. There is no import processing or live integration. The original local-only seed guard remains unchanged; hosted seeding was prepared separately and applied only to this newly created demo project.

Supabase's security adviser reported only the informational “RLS Enabled No Policy” notice on intentionally inaccessible migration history. Explanation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Verification and remaining steps

TypeScript, ESLint, 10 unit tests 23 local PostgreSQL/API tests and production build passed with the hosted connection validation changes. Remote checks confirmed restricted runtime role flags, zero Data API table grants and zero application tables without RLS. The demo is live at https://carepilot-demo-eta.vercel.app. The successful deployment is `dpl_9SCgPKpAf3oJrF4UTepa8Pq3Cxjy`, serving functions in Sydney. Eleven live HTTP checks passed: login page, anonymous API denial, generic invalid-login rejection, owner MFA and database session, single-organisation discovery, own settings, six integrations, source metadata, actual foreign-organisation denial, cross-origin mutation denial and revoked-cookie rejection. The pooler is aws-1-ap-southeast-2.pooler.supabase.com. This workspace cannot open outbound PostgreSQL connections directly; database connectivity was verified through the deployed app.

No paid plan, add-on, custom domain or real-data service was purchased. Free hosting/database quotas and pause behaviour still apply. Existing production-readiness limitations in PROJECT_STATUS.md remain; this is a synthetic demonstration, not a real-provider pilot.


## Hosted TLS and safe errors

The first live authentication test correctly rejected an untrusted database TLS chain. The driver now includes Supabase's published Root 2021 CA in its trust bundle while retaining certificate and hostname verification. Public CA source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt . SHA-256 fingerprint: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`, expires 26 April 2031. It is a public trust certificate, not a credential. Explicit pg connection fields prevent URL parameters from overriding TLS settings.

The same live test found that Auth.js could place thrown backend messages into a login error URL. The credentials callback now returns a generic denial and logs only a fixed service-unavailable message. Unit tests cover this failure path and verified TLS configuration.

## Stage 3 release

Stage 3 publication is authorised. Release the reviewed GitHub main revision to the existing Vercel project and Sydney Supabase project above; preserve current credentials, accounts and data. No additional service or paid resource is required.

Apply `202611240001_import_hub` and `202611240002_import_count_consistency` with their Prisma checksum/history entries, followed by `scripts/hosted-import-hardening.sql`. The latter removes Supabase's possible default API-role grants on the new permission function. The three new import tables enforce RLS and revoke all Data API grants in the migration itself. Existing Stage 2 routes remain compatible with the additive schema.

The source snapshot must come from the merged revision, include Prisma migrations and runtime sources, and exclude private files, local dependencies, tests, sample rejection fixtures and generated output. The build regenerates Prisma. Node.js 24 and `syd1` remain configured. Upload defaults (2 MiB and 2,000 rows) fit the bounded demo workflow; no unattended worker is introduced.

Local release verification: 31 unit, 38 PostgreSQL and 18 desktop/mobile browser tests passed, with four final import browser cases rechecked. TypeScript, ESLint, production build, dependency audit and schema diff passed. Verify hosted login/MFA, import preview/processing/retry, validation-report access, tenant denial, encryption and API grants after deployment. Do not treat a successful build alone as a successful release.

## Temporary public demo access (user authorised)

The user requested temporary removal of login prompts. An opt-in automatic entry uses the **existing Auth.js credentials/session system**, creating one-hour sessions for a separate `public-demo@carepilot.example` identity and a dedicated **CarePilot · Public Demo** organisation. No existing tenant or privileged account is made public; normal account login remains at `/login?account=1`.

Server variables: `PUBLIC_DEMO_ENABLED=true`, `PUBLIC_DEMO_USER_ID`, `PUBLIC_DEMO_ORGANISATION_ID`, and `PUBLIC_DEMO_EXPIRES_AT=2026-11-30T17:30:00.000Z` (1 December, 03:30 AEST). Missing/invalid/expired configuration fails closed. The feature automatically expires after the temporary period. To turn it off sooner, disable the synthetic public user or set `PUBLIC_DEMO_ENABLED=false` and redeploy. Disabling the user takes effect immediately for existing sessions. After the configured deadline, current demo cookies are rejected too.

The dedicated Public Demo role has navigation/source/import permissions only. It cannot change organisation/integration configuration, manage roles or read audit history. Session access is pinned to the configured organisation, even if an accidental additional membership is added; unexpected privileged grants fail closed. Owners and Administrators retain normal MFA. Auth.js CSRF and HTTP-only cookies remain enabled. Admission is limited to 100 public sessions per 15 minutes; public imports are limited to 1 MiB, 500 rows and ten new files per day. Files in this shared demo are visible to other demo visitors; the UI explicitly says to use fictional data only. Existing private workspaces retain their original limits.

Public demo sessions and actions are attributed to the shared demo identity, not to verified individual visitors. Password-free access is unsuitable for real provider information. No real records or secrets are seeded into this workspace. Provision its random IDs and an unknown random password hash once via trusted maintenance; never use an Owner/Administrator identity for these variables.

Stage 3 release verification before this follow-up passed 28 live HTTP checks, including authenticated CSV/XLSX imports, two-batch progress, idempotent retry, invalid files, protected report downloads, tenant denial, restricted auditor access and logout revocation. The new public entry receives separate local and hosted tests.
