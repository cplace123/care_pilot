# CarePilot

Stages 1–3 foundation and manual Integration Hub for an Australian aged care and NDIS operations, compliance and financial assurance platform. CarePilot **works alongside** ShiftCare, AlayaCare, Lumary, Visualcare and accounting software. It does not replace them.

The source of product requirements is [`CarePilot_PRD_v1.0.docx`](CarePilot_PRD_v1.0.docx), read in full before implementation. This foundation is deliberately smaller than the PRD's MVP: manual CSV/XLSX importing is implemented; AI, reconciliation, compliance automation, communications or external write-back remain deferred.

## Local setup

Requirements: Node.js **24.11+ on the 24.x line**, npm, Docker with Compose, and an authenticator app for privileged demo accounts. PostgreSQL 17 runs locally on `127.0.0.1:55432`. Stage 3 can also be published to the separately approved synthetic demo; see DEPLOYMENT.md.

```sh
cd /workspace/care_pilot
npm ci
node scripts/setup-env.mjs
npm run db:local
npm run db:setup
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The generated `.env` uses unique random secrets and is ignored by Git. If `.env` already exists, the setup script refuses to overwrite it; keep the existing configuration and continue. `.env.example` documents each setting if you prefer manual configuration. Use separate runtime and migration database credentials.

**In the provided workspace:** dependencies, private local configuration, the database, migrations and synthetic seed have already been prepared. Run `npm run db:local` and `npm run dev` from this directory.

The Docker database is for synthetic development data only. `db:setup` provisions a non-superuser, non-BYPASSRLS runtime role; run it before migrations. The application refuses a database URL using a username other than `carepilot_app`. `DIRECT_DATABASE_URL` is used only by migration, seed and local test tooling. Setup and seed commands refuse non-local database hosts. Do not point either URL at production without approval.

To stop the local database without deleting its data: `docker compose stop`. Do not remove its volume unless you intend to discard the local synthetic data.

## Demonstration accounts

All examples and organisations are fictional. All seeded accounts use the generated `DEMO_SEED_PASSWORD` in your private `.env`; no shared password is committed.

| Account | Workspace access | Role |
| --- | --- | --- |
| `owner@harbour.example` | Harbour Care | Organisation Owner; MFA required |
| `owner@wattle.example` | Wattle Support | Organisation Owner; MFA required |
| `auditor@harbour.example` | Harbour Care | Auditor |
| `manager@carepilot.example` | Both | Compliance Manager + Finance Manager |
| `operations@harbour.example` | Harbour Care | Operations Manager |

For an Owner, add that account's Base32 secret from the private `.demo-mfa.json` file to an authenticator app as a **time-based, SHA-1, six-digit, 30-second** token. Enter its current code when signing in. Codes cannot be reused; wait for the next code if you sign in again immediately. The seed file is local-only, has restrictive file permissions and is ignored by Git. Never share it or the `.env` file. Owners and Administrators without configured MFA cannot sign in. Other seeded roles do not require a code.

All accounts are provisioned by local tooling in Stages 1–2. Self-service registration, invitations, password recovery, MFA enrolment/recovery screens and role editing are intentionally absent. There are no production users. Provisioning and recovery processes must be completed and reviewed before a real pilot.

## Available behaviour

- Secure Auth.js credentials login, scrypt password hashing, authenticator MFA for privileged roles, login throttling, CSRF protection and encrypted session cookies.
- Eight-hour absolute server sessions; logout deletes the backing session. Active user, session, membership and permissions are checked on the server.
- Organisation chooser, multiple memberships and multiple roles; permissions are loaded from PostgreSQL on each protected request.
- PostgreSQL row-level security, tenant-scoped queries and composite foreign keys.
- Home, Issues, Compliance, Finance, AI Assistant, Integrations, Reports and Settings shell, with role-aware navigation. Inaccessible pages return the same generic unavailable page as unknown pages.
- White theme by default, persistent optional dark theme, responsive mobile navigation, keyboard focus styles, labelled controls and a skip link.
- Synthetic issue examples with a priority filter. Integration entries are disconnected directory records, not connectors. Recent activity contains actual access events for the synthetic accounts.

## Stage 2 foundation APIs

The existing Auth.js session protects all `/api/organisations/:organisationId` routes. GET reads organisation settings; PATCH updates only its name. `/integrations` lists safe connection metadata; PATCH `/integrations/:connectionId` updates only a display name. `/audit` and `/sources` return at most 50 recent events or source-record metadata. Raw imported payloads and credential references are not exposed. Stage 3 adds separately protected import endpoints described in [IMPORTS.md](IMPORTS.md).

Owner and Administrator receive `organisation.configure`, `integrations.configure` and `sources.read`; other roles retain their previous permissions. Mutations require same-origin JSON and strict validated fields. Database triggers audit changes atomically. Integration credentials are not accepted by these APIs; only an opaque future secret-manager reference can be stored by trusted provisioning.

For an existing Stage 1 local installation, run `npm run db:generate` and `npm run db:migrate`, then restart the server. Migrations preserve the existing membership table and data. No reseeding is necessary for the new permissions.

## Try the Stage 3 Integration Hub locally

For this existing workspace, run `npm run db:generate`, `npm run db:migrate`, and `npm run dev` (start the local database first if stopped). Do not reset or reseed the database. Sign in as an Owner with MFA, then open [http://localhost:3000/integrations](http://localhost:3000/integrations).

Choose **Import Data**, source **CSV**, and Participants / clients. Upload `samples/imports/01-participants.csv`, review mappings, choose ISO dates, then **Validate and preview → Import valid records**. Continue with the numbered synthetic files using their matching record types and the same source. See [sample instructions](samples/imports/README.md). CSV and XLSX variants are included; importing both deliberately exercises duplicate record handling.

Import history supports resume, row-level error downloads and duplicate-file reuse. Owners/Administrators can save reusable templates. Changed records require explicit approval to append immutable versions. Default limits are 2 MiB / 2,000 rows / 50 columns. Imports advance while the browser is open and resume safely from saved batches after interruptions. No external API connections or Stage 3 deployment were made.

See [IMPORTS.md](IMPORTS.md) for all nine record types, mapping rules, supported formats, security controls, API contracts, retry/version policy and limitations. Upload synthetic data only.

## Validation

Run against the local synthetic database. Integration and E2E tests intentionally mutate synthetic account state and must **not** run against shared or production databases. Do not run these suites concurrently with each other or with a demo session you need to preserve.

```sh
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the built application on port 3000 itself; stop any existing server first. It tests desktop Chromium and Pixel 7 Chromium emulation. In a restricted workspace, use `npm_config_cache=/tmp/carepilot-npm-cache` and `PLAYWRIGHT_BROWSERS_PATH=/tmp/carepilot-browsers` for install/test commands. The browser is already installed there in this workspace.

For manual testing of the production build on localhost only:

```sh
npm run build
LOCAL_PRODUCTION_TEST=true npm start
```

This explicit exception accepts HTTP only for a localhost application URL. Real production requires HTTPS, approved hosting and production secret management. Deploying is outside this stage.

## Structure

- `src/app`: App Router pages and Auth.js route handler.
- `src/components`: shared shell, controls and synthetic queue presentation.
- `src/lib/server`: authentication, server-only database access and tenant authorization.
- `src/lib`: validated configuration, password/MFA helpers, permission definitions and demo fixtures.
- `prisma`: relational schema and versioned SQL migrations, including RLS and immutable activity-history controls.
- `scripts`: guarded local environment/database setup and synthetic seeding.
- `tests`: Vitest unit/integration suites and Playwright browser suites.

See [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [PROJECT_STATUS.md](PROJECT_STATUS.md) for decisions, verification results, limitations and the full changed-file inventory.

## Hosted synthetic demo

The approved Sydney synthetic demo is available at [carepilot-demo-eta.vercel.app](https://carepilot-demo-eta.vercel.app). See [DEPLOYMENT.md](DEPLOYMENT.md) for the hosting configuration and current status. Local setup commands remain unchanged. Hosted runtime configuration uses a separate restricted Supabase pooler account and fresh secrets; do not upload your local `.env`.

Temporary hosted public demo access is opt-in and isolated from existing organisation accounts. It automatically opens a shared fictional-data workspace; use `/login?account=1` for normal credentials. See DEPLOYMENT.md for the expiry and disable switch. Local development keeps this mode disabled by default.
