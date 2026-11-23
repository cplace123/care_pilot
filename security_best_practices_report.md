# CarePilot Stage 2 security review

Reviewed 23 November 2026 using the locally installed official `security-best-practices` skill and its Next.js, React and general frontend references. Stage 2 authorizes the implemented fixes. This is a code review and local synthetic test exercise, not a penetration test or production certification.

## Summary

The existing Auth.js implementation was retained. Stage 2 strengthens tenant context validation, least-privilege database grants, schema constraints, append-only audit coverage, session revocation visibility and protected API writes. No critical unresolved finding was identified within the reviewed foundation; important production work remains below.

## High-priority findings fixed

**1. Automatic write grants on future tables.** The original setup granted SELECT/INSERT/UPDATE/DELETE on every new table to the runtime role. Impact: a later feature or missing service check could mutate a table intended to be read-only. Fixed in `scripts/setup-local-db.ts:13` and migration `202611230006_least_privilege_defaults/migration.sql:3`; SourceRecord explicitly receives SELECT only. An actual PostgreSQL negative-write test caught this issue and now passes.

**2. Tenant context alone was sufficient at the RLS layer.** Application membership checks already blocked foreign access, but incorrectly assigned database context could expose the wrong organisation to internal code. Migration `202611230004_stage2_security/migration.sql:62` adds `tenant_allowed`, checking active membership/account as well as the selected organisation. `src/lib/server/access.ts:24` retains session, MFA and live permission checks. Forged-context and concurrent-scope tests verify the additional boundary. This does not protect against arbitrary SQL access with stolen server credentials, which could impersonate another context user.

## Medium-priority findings fixed

**3. Audit coverage omitted configuration, permission, import and denied-access events.** Migration `202611230004_stage2_security/migration.sql:101` adds atomic, metadata-minimising triggers; line 98 prevents TRUNCATE in addition to the original UPDATE/DELETE protection. `src/lib/server/security-events.ts:5` records failures without unverified attribution or submitted secrets. Authentication events use a restrictive actor foreign key; logout and its event commit atomically. Tests cover actual configuration/import events, permission events and rejected audit mutation. Database owners can still alter schema/triggers; operational immutable archival is not implemented.

**4. A revoked token could still describe a user in the session endpoint.** Protected pages already rechecked the backing session. `src/lib/server/auth.ts:23` now clears invalid session identity in the Auth.js callback too. Browser tests replay revoked cookies against pages, foundation APIs and `/api/auth/session`.

**5. New cookie-authenticated mutations require explicit request controls.** `src/lib/server/api.ts:39` requires exact configured Origin, JSON and a streamed 16 KiB limit. Route schemas reject unknown fields; safe DTOs omit credential references and imported payloads. API permission checks are server-side and errors are sanitised (`api.ts:22`). Browser and database tests cover forbidden tenants, CSRF, rejected status changes, invalid input and no-store responses.

## Medium-priority production work outstanding

**6. CSP permits inline scripts/styles.** `next.config.ts:10` retains the existing framework-compatible policy. This weakens defence in depth if an injection flaw is introduced; no injection exploit was identified in this review. Before a real pilot, implement and test nonce-based script policy without breaking Next.js rendering. No raw HTML injection was introduced in Stage 2.

**7. Authentication throttling is per identifier; operational controls remain incomplete.** `src/lib/server/auth-service.ts:26` persists a 10-attempt/15-minute account window, but does not provide edge/IP/device limits or protect the whole service from resource exhaustion. Add approved ingress rate limits, request timeouts, alerting and security-log retention before internet exposure. Failure events deliberately omit submitted identifiers, limiting forensic correlation until an approved privacy-preserving telemetry design exists.

**8. Real-user provisioning and recovery remain unavailable.** Local synthetic seed tooling is not a production onboarding, password reset, MFA recovery or key rotation process. Complete those workflows and independently review them before real users/data. A secret-manager reference is only a reference, not an implemented secret manager. Production encryption at rest, backups, regional hosting and recovery were not tested.

## Validation boundary

Results are recorded in PROJECT_STATUS.md. All database tests use local PostgreSQL and synthetic identities. Application credentials are non-superuser/non-BYPASSRLS; migration credentials remain privileged and local. No production system, external integration, AI provider or deployment was accessed. Browser coverage uses Chromium desktop/mobile emulation; other engines, load testing and independent security assessment remain outstanding.
