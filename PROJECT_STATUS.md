# CarePilot project status

Stage: **Stage 2 complete — local database and security foundation.** Stage 3 has not started.

The user approved Stage 2 and installation of the official security-best-practices skill. It is installed project-locally under `.agents/skills/security-best-practices`; the review is in `security_best_practices_report.md`.

The full PRD was read before implementation. Its original DOCX is preserved byte-for-byte. The original repository had only a minimal README; no application code or existing configuration was replaced. No production database, external business service, AI provider or deployment was used. PostgreSQL runs in an isolated local Docker service and contains only fictional demonstration data.

## Completed

- Next.js App Router, React, strict TypeScript, Tailwind, linting and testing configurations; compatible stable dependency versions and lockfile.
- Validated runtime configuration, private generated local secrets, `.env.example` and repeatable local setup instructions.
- PostgreSQL/Prisma schema for organisations, users, permissions, organisation-owned roles, multiple memberships and role assignments, integration directory, import jobs, audit events, authentication sessions and throttling.
- Eight versioned SQL migrations (three Stage 1 and five additive Stage 2 migrations), applied and verified locally, including RLS, composite foreign keys and append-only audit history.
- Auth.js login/logout, memory-hard password hashing, privileged-user TOTP MFA with encrypted secrets and replay prevention, session expiration/revocation and CSRF controls.
- Server-enforced organisation membership and current role permissions; no access from a tenant URL alone.
- All eight requested navigation destinations, responsive shell, default light/optional persistent dark theme, organisation switching and synthetic examples with a priority filter.
- Actual synthetic-account access history separated from illustrative issue examples; no claimed syncs, AI findings, calculated totals or compliance assessments.
- README, implementation plan, architecture and this status record.

## Final verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; no warnings |
| `npm test` | 7 unit tests passed |
| `npm run test:integration` | 23 tests passed against local PostgreSQL using restricted runtime credentials |
| `npm run build` | Passed; all App Router routes compiled |
| `npm run test:e2e` | 14 tests passed: 7 desktop Chromium + 7 Pixel 7 Chromium emulation |
| `npm audit` | Zero reported vulnerabilities, including development dependencies |
| Prisma migration/schema diff | No difference detected |
| Git whitespace check | Passed |
| Generated private-secret scan | No generated secrets found in source-controlled file candidates |
| Original PRD comparison | Byte-for-byte match with uploaded document |

Database tests cover foreign tenant denial, missing-filter RLS protection, membership discovery, concurrent transaction scoping, composite foreign keys, immutable history, same-tenant permission denial, immediate role/membership revocation, MFA session assurance, MFA code replay, expired/revoked sessions, disabled users and persistent login throttling. Browser tests cover unauthenticated routes, generic credential errors, privileged MFA, all eight destinations, mobile navigation, filters, theme persistence, single main headings, horizontal overflow, organisation switching, combined roles, foreign organisation URLs, CSRF rejection and reuse of revoked cookies. Desktop/mobile screenshots were visually inspected. No browser JavaScript errors were detected in the full-shell flow.


## Stage 2 delivery

- Preserved Stage 1 UI, Auth.js, configuration and local data. No second authentication system or new runtime dependency.
- Added SourceRecord with tenant/connection/import composite foreign keys, uniqueness and hash constraints. Renamed Prisma Membership to OrganisationMembership using `@@map("Membership")`; no table recreation.
- Extended Organisation, User, OrganisationMembership, Role, Permission, IntegrationConnection and ImportJob timestamps; ActivityEvent gains JSON metadata, optional unscoped security events and a restrictive actor relationship.
- Added safe integration display metadata and an opaque credential reference for the six approved providers. Public APIs cannot supply credentials, connect services or change integration status.
- Strengthened membership-aware RLS; removed broad default grants. Runtime source records remain read-only; organisation and integration writes are column-restricted.
- Added atomic audit triggers and TRUNCATE protection. Added failure/denial events and hashed session references. Logout audit is transactional; revoked sessions are cleared in the session endpoint.
- Added protected organisation/settings, integration, audit and source-metadata APIs. Owner/Administrator receive three explicit permissions; other roles remain unchanged. Inputs are strict/bounded, writes require exact same-origin JSON, errors are generic and responses are not cached.
- Extended tests for forged context, source constraints, default grants, configuration audit, API errors, CSRF, credential/status rejection, no-membership auth audit and revoked-cookie API access.

The first database test run exposed audit INSERT RETURNING incompatibility with intentionally hidden security events, a missing timestamp-column grant for MFA, and inherited write grants on SourceRecord. All were corrected and final tests passed. An initial browser launch was blocked by the running development server; it was stopped before the successful test run.

### Stage 2 changed-file inventory

**Created:** `.agents/skills/security-best-practices/` (official skill, references, licence and provenance); `security_best_practices_report.md`; migrations `202611230004_stage2_security`, `202611230005_runtime_timestamp`, `202611230006_least_privilege_defaults`, `202611230007_audit_actor`, `202611230008_unscoped_auth_audit`; `src/lib/server/api.ts`; `src/lib/server/security-events.ts`; API route handlers under `src/app/api/organisations/[organisationId]/` for the organisation, integrations, individual connection, audit and sources.

**Modified:** `AGENTS.md`, `README.md`, `PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md`, `ARCHITECTURE.md`, `prisma/schema.prisma`, `scripts/seed.ts`, `scripts/setup-local-db.ts`, `src/lib/permissions.ts`, `src/lib/server/access.ts`, `src/lib/server/auth-service.ts`, `src/lib/server/auth.ts`, `src/app/app/[organisationId]/[[...section]]/page.tsx`, `tests/integration/isolation.test.ts`, `tests/e2e/workspace.spec.ts`. Prisma client and build/test artifacts were regenerated and remain ignored. PRD and dependency versions remain unchanged.

No known Stage 2 implementation blocker remains. Recommended Stage 3: agree supported export formats and mappings, then implement a strictly scoped synthetic import/validation workflow. Approval is required before starting it. Production readiness limitations below remain unresolved.

## Known limitations and untested areas

- This is a foundation, **not a production-ready service or completed PRD MVP**. No real provider data or production infrastructure was tested.
- Chromium desktop and mobile emulation were tested; Firefox, Safari/WebKit, physical devices, screen-reader workflows and a formal WCAG audit were not. Keyboard focus/labels/landmarks and responsive overflow were implemented and checked within the available scope.
- No load, penetration, independent cryptographic/security, disaster-recovery or legal/privacy assessment was performed.
- Account creation, password/MFA recovery, invitations and role editing use no public UI yet. Demo provisioning is local-only. A production onboarding/recovery process needs implementation and independent review before real users.
- Audit logging covers authentication, denial/throttling, organisation/integration configuration, permission/membership changes and import/source-record mutations. Unknown actors/tenants are null with explicit metadata; unscoped security events are inaccessible to tenant readers. Operational alerting, archival and retention/cleanup jobs remain pre-pilot work.
- Service/sensitivity-level permission rules are not implemented; ambiguous PRD “limited/configurable” permissions are denied conservatively. Operations Manager is limited to dashboard/issues. AI Assistant has no active permissions.
- Integration rows are disconnected placeholders. ImportJob is a schema foundation, not an import capability. AI, compliance, financial reconciliation, reports and exports are not functional.
- Authenticator recovery and key rotation are not automated. The private MFA seed file is for synthetic local testing only; production secrets require an approved secret manager and recovery process.
- ESLint 9.39.5 is deprecated upstream but is the newest compatible release for the installed Next.js lint plugins. The newer major currently violates their peer ranges. Track compatible updates.
- Prisma's transitive Effect dependency is patched via a documented 3.x override. Keep the override under review when upgrading Prisma.
- CSP currently allows inline framework scripts/styles. Nonce-based hardening and edge rate limiting belong in the pre-pilot review, alongside Australian-region hosting, TLS, encryption at rest, backups, monitoring and incident response.
- Session payloads are not authorization evidence: protected services always revalidate the database session. Expired sessions and throttle rows currently require maintenance cleanup.
- Local test suites mutate synthetic account state; run them serially and only against the isolated demo database.

## Local handover

The current workspace has dependencies, local configuration, migrations and synthetic seed installed. From `/workspace/care_pilot`, run:

```sh
npm run db:local
npm run dev
```

Open `http://localhost:3000`. Use an account from README and the generated `DEMO_SEED_PASSWORD` in private `.env`. For full access, enrol the Owner's private local authenticator secret from `.demo-mfa.json` and enter its current code. No secrets are included in this document. See README for clean setup, full tests and production-build testing on localhost.

## Approval boundaries

Stage 2 was approved and completed. Stage 3 requires new approval. SourceRecord storage is prepared, but no import processor, assurance rules, task mutations, AI or exports were implemented. External services, production database access, hosting/deployment and real provider data remain unapproved. The PRD's unresolved vendor/export formats, rule priorities, AI processing terms and Australian hosting decisions remain open.

## Stage 1 file inventory (preserved)

**Modified:** `README.md` (expanded the original project heading into setup and usage documentation).

**Preserved:** `CarePilot_PRD_v1.0.docx` (saved before implementation; unchanged).

**Created:**
- `.env.example`
- `.gitignore`
- `ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `PROJECT_STATUS.md`
- `docker-compose.yml`
- `eslint.config.mjs`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `postcss.config.mjs`
- `prisma.config.ts`
- `prisma/migrations/202611230001_foundation/migration.sql`
- `prisma/migrations/202611230002_mfa_and_discovery/migration.sql`
- `prisma/migrations/202611230003_session_assurance/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `prisma/schema.prisma`
- `scripts/seed.ts`
- `scripts/setup-env.mjs`
- `scripts/setup-local-db.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/app/[organisationId]/[[...section]]/page.tsx`
- `src/app/app/page.tsx`
- `src/app/error.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/login/page.tsx`
- `src/app/not-found.tsx`
- `src/app/page.tsx`
- `src/components/app-shell.tsx`
- `src/components/brand.tsx`
- `src/components/demo-issues.tsx`
- `src/components/icon.tsx`
- `src/components/login-form.tsx`
- `src/components/sign-out.tsx`
- `src/components/theme-toggle.tsx`
- `src/lib/demo.ts`
- `src/lib/env.ts`
- `src/lib/mfa.ts`
- `src/lib/password.ts`
- `src/lib/permissions.ts`
- `src/lib/server/access.ts`
- `src/lib/server/auth-service.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/db.ts`
- `src/types/next-auth.d.ts`
- `tests/e2e/workspace.spec.ts`
- `tests/integration/isolation.test.ts`
- `tests/server-only.ts`
- `tests/unit/security.test.ts`
- `tsconfig.json`
- `vitest.config.ts`

**Generated locally and intentionally excluded from Git:** `.env`, `.demo-mfa.json`, `src/generated/prisma/`, `node_modules/`, `.next/`, TypeScript build cache and Playwright artifacts under `test-results/`. Local Docker volume contains only seeded fictional data.
