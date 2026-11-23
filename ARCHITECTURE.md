# CarePilot architecture — Stages 1–3

## Stage 3 extension (current)

The approved manual Integration Hub reuses Auth.js, `withOrganisation`, PostgreSQL RLS, the existing audit system, navigation and themes. Additive migrations `202611240001_import_hub` and `202611240002_import_count_consistency` create ImportFile, ImportMapping and ImportError; extends ImportJob lifecycle/provenance/mapping/progress; adds SourceRecord fingerprints and immutable snapshot enforcement; expands the provider allowlist without making API connections.

`src/lib/imports/catalog.ts` defines the nine minimum internal record structures. `validate.ts` maps and validates deterministic decimal strings, dates, timestamps and identifiers. Server-only `import-files.ts` bounds and inspects uploads and encrypts file bytes. `imports.ts` manages per-source locks, immutable deduplication/versioning, references, templates, transactional batches and safe audit/report DTOs. `integration-hub.tsx` presents the workflow using existing styles. See [IMPORTS.md](IMPORTS.md) for the full contract and security controls.

Files are encrypted in PostgreSQL for this bounded local stage; no new object-storage service is connected. A durable database cursor with authenticated 50-row POST batches avoids a detached server task or paid worker. Processing pauses when the browser closes and resumes explicitly. These decisions preserve recoverability while keeping the small-file scope local; unattended workers and object storage require a later operational design.

New `imports.read` and `imports.write` permissions are granted to Owner/Administrator only. New tables use forced RLS; mutation policies also check live import permission. SourceRecord remains immutable, with permission-guarded INSERT now enabled for importing. Existing column-restricted integration configuration remains intact; new directory inserts can only create disconnected, read-only sources. Runtime cannot delete imports/files/errors or overwrite snapshots. Authenticated Original-file downloads are intentionally absent; validation downloads omit original values.

No AI, reconciliation, compliance automation, external API calls or deployment is part of Stage 3. The hosted synthetic demo remains Stage 2. Historical foundation decisions below describe the pre-import state; this section and IMPORTS.md supersede statements that importing is unavailable.

## Historical Stage 1–2 system boundary

CarePilot is a modular Next.js application alongside existing care and finance systems. This stage has no external API clients, upload processing, AI calls, calculation engine or background workers. Synthetic issue fixtures are presentation-only and never stored as imported facts. Disconnected integration-directory rows and empty import-job tables establish future boundaries without implementing integrations.

App Router server components render authenticated workspaces. Small client components handle login, logout, theme selection and synthetic filtering. The browser never receives database credentials, password hashes, MFA secrets or permission-management capabilities. Server code is marked `server-only`.

## Compatible versions

Versions were verified against registry metadata and peer dependencies at implementation time, then validated by installation and build:

| Component | Selected version | Reason |
| --- | --- | --- |
| Node.js | 24.22.3 tested; 24.11+ required | Compatible LTS runtime across the selected toolchain |
| Next.js | 16.4.6 | Stable; App Router |
| React / React DOM | 19.3.1 | Stable and within Next/Auth.js peer ranges |
| TypeScript | 5.9.3 | Latest compatible 5.x; selected ESLint parser excludes TypeScript 7 |
| Tailwind CSS / PostCSS plugin | 4.3.5 | Matching stable releases |
| Auth.js Next.js package (`next-auth`) | 4.24.15 | Stable; v5 remains beta; explicitly supports Next 16 / React 19 |
| Prisma client / CLI / PostgreSQL adapter | 7.10.1 | Matching latest stable 7.x; registry default pointed to an 8.0 release candidate |
| PostgreSQL | 17.12 tested via `postgres:17-alpine` | Supported stable database major for local development |
| ESLint | 9.39.5 | Latest compatible 9.x; Next's bundled plugins do not yet support ESLint 10 |
| Vitest | 5.1.1 | Stable; compatible with Node 24 |
| Playwright | 1.65.1 | Stable; Chromium desktop and mobile emulation tested |

ESLint 9 is marked deprecated upstream. Moving to 10 requires compatible Next lint plugin releases; forcing peer dependencies was avoided. Prisma's config package pins a vulnerable Effect release; `package.json` overrides only that transitive dependency to patched **Effect 3.22.5**, within the same major. Regeneration, migrations, typechecking, tests and build validate the override. Revisit it when Prisma updates its dependency. `package-lock.json` is the reproducibility source.

## Data model

- `Organisation`: tenant boundary.
- `User`: global login identity; unique normalized email, password hash, active status, encrypted optional MFA secret and last consumed TOTP step.
- `OrganisationMembership` (mapped to the preserved SQL `Membership` table): organisation/user relationship with independently revocable active status.
- `Role`: organisation-owned named role. `MembershipRole` allows multiple roles per membership.
- `Permission`: global permission definitions. `RolePermission` assigns permissions to an organisation's roles.
- `IntegrationConnection`: provider directory, read-only default, status and nullable last successful sync timestamp. Optional display name and opaque `secret://` reference; no credentials or connectors exist yet.
- `ImportJob`: tenant-owned future import metadata, status, timestamps, source label, record count, error code and unique per-tenant idempotency key. No import processor exists.
- `ActivityEvent`: organisation, actor ID, action, resource identifier and timestamp. Structured, bounded JSON metadata excludes sensitive contents. Append-only triggers block UPDATE/DELETE/TRUNCATE. Actor has a restrictive User foreign key.
- `SourceRecord`: tenant-owned snapshot tied to the same organisation, connection and import job by a composite foreign key. Unique external record identity per job, SHA-256 format constraint, bounded identifiers, JSON payload and lookup indexes. Runtime role is read-only; no import worker exists.
- `AuthSession`: opaque session ID, user, MFA assurance, creation and absolute expiration. Revocation deletes the row.
- `LoginThrottle`: hashed normalized identifier, attempt count and reset timestamp. Atomic PostgreSQL upsert provides a shared 10-attempt/15-minute window.

Composite foreign keys include `organisationId` on role assignments, role permissions and import connections. Even privileged maintenance cannot accidentally attach an import or role assignment to a different tenant. Tenant/activity indexes support scoped reads.

## Tenant enforcement

1. Auth.js verifies the encrypted session cookie. `requireIdentity` also checks the backing session and active user.
2. `withOrganisation` opens a transaction, revalidates the session and uses parameterized `set_config(..., true)` to set user and organisation context **for that transaction only**.
3. It looks up an active membership for the server-authenticated user and requested organisation. The route identifier alone never grants access.
4. It loads current role permissions from the database, requires MFA assurance for privileged roles and checks the requested permission before running the service callback.
5. Service queries explicitly filter by organisation. PostgreSQL forced row-level security adds another boundary for tenant tables, including a missing-filter mistake.
6. The transaction ends before the connection is returned to the pool, preventing tenant context reuse. Concurrent scope isolation is tested.

Membership discovery allows the authenticated user to list their own active memberships before choosing a workspace. Organisation discovery uses that relationship. Global identity, session and throttle tables are internal authentication infrastructure and have no browser CRUD endpoints.

**Trust boundary:** RLS context is assigned by trusted server code; it is not a substitute for membership validation. A database credential holder capable of arbitrary SQL could set context themselves. Never expose the application database role to a browser, and never accept context/user IDs from client claims. All future tenant services must use `withOrganisation` and permission checks. Runtime must be non-superuser, non-BYPASSRLS and distinct from the migration role. Local migration explicitly grants read-only access to business tables, INSERT to audit events, session/throttle operations and only the MFA replay counter/timestamp update on User plus narrow organisation-name and integration-display-name updates. Newly introduced tables need explicit privilege review in their migrations.

## Authentication and auditing

- Passwords use Node's scrypt (N=131072, r=8, p=1, 64-byte output) with independent random salts and constant-time comparison. Provisioning rejects passwords shorter than 14 or longer than 128 characters.
- Authentication errors do not distinguish missing accounts, wrong passwords, missing MFA and throttling. Unknown accounts still perform a password-hash comparison.
- Privileged roles require a configured authenticator secret and a valid TOTP code. Secrets use AES-256-GCM with random nonces and a separate environment-managed encryption key. Accepted codes have a ±1 step clock window and an atomic monotonic counter prevents replay.
- Auth.js uses its supported credentials/JWT strategy. A database session backs each encrypted cookie; roles and tenant memberships are **not** trusted from JWT claims. Eight-hour absolute expiration is enforced by the database record even if the cookie is refreshed.
- An MFA assurance flag on the session prevents a password-only session gaining privileged access after a role change.
- Auth.js provides CSRF checks and HTTP-only, same-site cookies; secure cookies apply with HTTPS. The production configuration requires HTTPS except an explicit localhost-only build-test exception.
- Login and logout append events to each active organisation membership. Login fails closed if its audit write fails; logout atomically revokes the session and writes its audit event. Session references in new audit events are hashed again and cannot serve as session handles.
- Database triggers append events in the same transaction as organisation, membership, role/grant, integration, import-job and source-record changes. System maintenance has a null actor with explicit system metadata. No raw row contents, passwords, credential references or imported payloads are copied into audit metadata.

Local seed/provisioning uses separate administrative credentials and is restricted to an explicitly enabled local database. It is not a production account-management service. Failed authentication, throttling and access denial are recorded without submitted identifiers or secrets. Unverified actors and unknown organisations remain null rather than being attributed to a victim. Tenant sessions cannot read unscoped security events. Operational collection, retention and alerting remain pre-pilot work.

## Permission defaults

Owner/Administrator receive all implemented read permissions plus organisation/integration configuration and source-metadata access. Compliance Manager receives compliance and audit/report access; Finance Manager receives finance/report access. Auditor has read-only dashboard/compliance/finance/report/audit access without integrations/settings/issues. Operations Manager gets dashboard/issues only. Restricted AI Assistant receives no active permissions because no AI service exists.

The PRD's configurable and limited access entries are conservatively denied until service-type/sensitivity constraints and relevant features exist. Operations permissions were not enumerated in its table, so they remain minimal. No financial correction, export or user-management permissions are fabricated. Permissions combine across multiple roles within a single membership, never across organisations.

## UX and data honesty

One main heading per page, a task-focused dashboard instead of KPI tiles, explicit no-sync status and an always-visible synthetic preview notice. No functional buttons imply imports, generated reports, AI output or financial corrections. Issue examples are filtered to the user's permitted domain. Actual activity records are shown only with `audit.read`. Timestamps are explicitly labelled Sydney time in the application; configurable organisation timezone is future work.

## Production boundaries

No deployment or external connections have been made. Before any real pilot: independent security/privacy review; approved Australian-region hosting; encrypted database/storage/backups; TLS; production secrets and key rotation; account/MFA recovery and onboarding; rate limiting at the edge; alerting and failed-login telemetry; audit archival and access review; session/throttle retention; recovery drills; appropriate service/sensitivity permission constraints; and a stronger nonce-based CSP. Current CSP permits inline Next.js scripts and inline styles, blocks framing, objects and external resources, and enables eval only in development. Do not treat this foundation as a completed PRD security programme.


## Stage 2 security and API decisions

`tenant_allowed` verifies both the transaction organisation and an active membership/account. Membership discovery is self-only. This closes accidental context mismatch as well as missing WHERE clauses; trusted-server context remains the boundary against arbitrary SQL credential compromise. Newly created tables receive no automatic runtime grants. SourceRecord is SELECT-only; runtime cannot insert imports or change integration status, read-only mode or credential references.

The existing Auth.js session callback validates its backing session, clearing identity on revocation/expiry. API access revalidates it and current permissions. Safe 401/403/400/500 responses never expose database exceptions; private responses use `Cache-Control: private, no-store`. Organisation switching remains the existing chooser and validated URL; permissions are evaluated separately for each organisation.

PATCH handlers permit only organisation name or integration display name, using strict Zod schemas, a 16 KiB streamed body limit, JSON content type and exact Origin matching to configured NEXTAUTH_URL. Foreign tenant objects are never updated. Read handlers expose selected integration fields and source metadata, not source payloads or secret references. Audit/source lists are bounded to 50 records; pagination and operational audit export are deferred.

Application RBAC restricts writes to Owner/Administrator. SQL grants also restrict writable columns, while RLS ensures tenant membership. RLS is not claimed to enforce every application permission against arbitrary SQL by a compromised server. Authentication infrastructure remains global and internal. The database owner can alter triggers/schema; append-only controls protect normal SQL operations, not a malicious superuser. External immutable archival is future operational work.

Credentials are not stored in plaintext: this stage stores only validated opaque secret-manager references, accepts none through public APIs and has no secret manager integration. A reference is not encryption and must never contain an actual secret. Imported JSON is reserved for a future explicitly approved synthetic import workflow; production retention, minimisation and encryption-at-rest require review before real data.

## Hosted demo adaptation

The approved synthetic demo uses Supabase PostgreSQL's shared pooler with a project-scoped `carepilot_app.<ref>` username. DATABASE_PROJECT_REF validation preserves the restricted underlying role, limits hosts to Supabase poolers and requires verified TLS. Prisma's pg adapter pool has at most three connections per application instance. Supabase Data API grants are revoked; Auth.js remains the authentication system. See DEPLOYMENT.md and scripts/hosted-database-hardening.sql for hosting-specific controls.

## Temporary public demo

An opt-in Auth.js credentials flow creates short-lived sessions for one isolated synthetic organisation. Server checks pin public sessions to that organisation, revalidate an allowlisted Public Demo role, and reject expired or disabled public access. Existing tenant authentication and privileged MFA remain required. Public imports have smaller admission limits. The UI marks the workspace as shared and requires fictional data. Configuration, expiry and immediate disable instructions are in DEPLOYMENT.md.
