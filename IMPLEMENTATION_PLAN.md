# CarePilot implementation plan

## Scope and source

Read the complete PRD v1.0 (all 27 sections and role tables) before implementation. The user's Stage 1 brief limits this delivery to the foundation, even though the PRD describes a much larger MVP. Preserve the original document and repository; do not deploy, connect business services or start Stage 2.

## Stages

1. **Inspect and reconcile requirements — complete.** Existing repository contained only a heading in README and the saved PRD. No existing application was replaced. Read product principles, tenancy, role matrix, dashboard, security and UX requirements.
2. **Compatible project setup — complete.** Check package metadata and peer ranges; configure Next.js App Router, React, TypeScript, Tailwind, ESLint, environment validation, Vitest and Playwright. Lock dependency versions.
3. **Database foundation — complete.** Model organisations, users, permissions, organisation-owned roles, memberships and multiple role assignments, integration connections, import jobs and append-only activity events. Add server-session and login-throttle infrastructure. Generate migrations and test only against local PostgreSQL with separate credentials.
4. **Authentication and authorization — complete.** Auth.js credentials login/logout, password hashing, privileged-user MFA, server-session revocation, server-side role enforcement, transaction-local tenant scope and database row-level security. No public registration or account administration screens in this stage.
5. **Initial UI — complete.** Build an accessible responsive shell with the eight specified destinations, light/dark themes and synthetic examples. Clearly identify unavailable future features; do not invent findings, syncs or financial totals.
6. **Verification and handover — complete.** Unit, real-database isolation and browser tests; lint, typecheck, production build, dependency audit and documentation. Record limitations rather than treating foundation checks as production certification.

## Stage 1 deferred scope (historical)

At the end of Stage 1: Stage 2 implementation, supported import formats/mappings, source records, scheme-specific rules, reconciliation, compliance automation, evidence exports, task mutations, AI providers, live integrations, external messages, approved write-back, paid services, deployment and production database access.

The complete MVP registration/onboarding and operational security programme are not implied by this Stage 1 delivery. See PROJECT_STATUS.md for the exact remaining work.


## Stage 2 — approved and implemented

1. Verify Stage 1 and reread the PRD and project documents. Preserve its working UI and Auth.js implementation.
2. Install the requested official security-best-practices skill locally with user approval and apply Next.js/React guidance.
3. Extend Prisma with SourceRecord, timestamps, safe integration metadata and structured audit metadata. Rename the Prisma membership model without renaming its SQL table.
4. Apply additive migrations locally; strengthen RLS membership checks, composite constraints, audit triggers and least-privilege grants.
5. Add protected organisation/integration configuration and read-only audit/source metadata APIs; enforce live permissions, strict input, same-origin mutation requests and safe errors.
6. Extend real-PostgreSQL and browser tests, verify existing flows, document results and remaining operational risks.

Stage 3 is not authorized. Recommended next work is a separately scoped synthetic import/validation workflow, after confirming source formats and mappings against the PRD. No processor, AI, reconciliation, compliance automation, external connection or deployment is included here.

## Approved hosting follow-up

Deploy the existing Stage 2 application as a synthetic-only demo on free resources: create the requested Sydney database, apply the existing migrations with restricted role/API grants, configure fresh hosted secrets, build on Vercel in Sydney, then verify live login/logout and tenant boundaries. Track completion in DEPLOYMENT.md; no new product stage is included.
