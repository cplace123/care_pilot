# CarePilot synthetic demo deployment

The user approved a free Vercel demo and a separate Supabase database, then requested Sydney. This authorizes demo hosting only; Stage 3 and real provider data remain outside scope.

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
