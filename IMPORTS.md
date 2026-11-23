# Stage 3 manual import contract

CarePilot imports exports alongside existing software. The ten source choices are provenance labels; none is a verified or active API integration. Vendor-native column layouts have not been verified. Templates are organisation- and source-specific.

## Workflow and permissions

Open `/integrations` (single-membership shortcut) or `/app/:organisationId/integrations`. Multiple-membership users choose their organisation first. Owners and Administrators receive `imports.read` and `imports.write`; other default roles receive neither. Existing Auth.js, live sessions/MFA and tenant permissions protect every request. `imports.read` controls previews/history/downloads; `imports.write` controls uploads, mapping and processing. Grant both for an importer.

Choose source → record type → upload → map fields → choose explicit date format → preview → import valid records. Save a named mapping template to reuse exact heading names. Changed headings require correction. Preview shows 20 mapped rows and up to 100 errors; the validation report contains all errors. Preview is advisory: each batch rechecks references and duplicates against committed data. A configuration checksum prevents processing a mapping changed in another tab.

Uploads have UUIDs, SHA-256 checksums, initiating user/organisation, source and creation time. Original filenames are validated but not retained, avoiding accidental personal information in logs/history. Statuses are Uploaded → Validating → Mapping Required → Ready → Processing → Completed / Completed With Errors / Failed. Upload/validation transitions are atomic and may not be visible as separate intermediate screens; audit events record them. Legacy QUEUED/RUNNING statuses remain for schema compatibility and cannot be processed by this workflow.

## Formats and limits

- UTF-8 comma-separated CSV (BOM supported, quoted fields supported) and plain `.xlsx` with **one worksheet**. No `.xls`, `.xlsm`, macros, formulas, hyperlinks, external references, embedded objects, DTDs/entities, numeric XML character references or arbitrary ZIP members.
- Default **2 MiB / 2,000 data rows / 50 columns**; configure `IMPORT_MAX_BYTES` and `IMPORT_MAX_ROWS`, with hard ceilings of **4 MiB / 5,000 rows**. Invalid configuration fails closed. Maximum CSV record 16 KiB and cell 2,000 characters; mapped text/identifiers at most 200 characters. Unique, non-empty headings, at most 100 characters.
- ZIP inspection bounds total expanded bytes to 8 MiB, entries to 200, worksheet row/cell counts and coordinates. Entry sizes and encryption flags are checked before the workbook reader. Nothing is extracted to disk. Workbook numeric cells remain their original decimal strings.
- 100 uploads per organisation per 24 hours; transactional admission is serialised. Oversized/unsupported requests are rejected before storage. Corrupted admitted files remain encrypted with a Failed job and cannot be processed.
- CSV dates require explicit **ISO YYYY-MM-DD** or **Australian DD/MM/YYYY** selection. Never infer US dates. Native Excel date cells are converted to ISO; select ISO for these. Native Excel cells containing a time are rejected rather than truncated. Optional `sourceUpdatedAt` must be an ISO **text timestamp with timezone**, normalised to UTC.
- Monetary values are AUD decimal strings, maximum 12 integer digits and two fractional digits, non-negative, no symbols/group separators/exponents. Values are validated and padded using string operations, never floating-point calculations. Negative/refund-specific semantics and other currencies are not implemented.

## Minimal internal mapping structures

Every record requires `externalId`; all support optional `sourceUpdatedAt`. Names are optional; import only needed fields. Unmapped columns are omitted from SourceRecord payloads, though the encrypted original is retained for repeatable parsing.

| Type | Additional required fields | Optional fields / relationships |
| --- | --- | --- |
| Participants | None | `displayName` |
| Workers | None | `displayName` |
| Services | `participantExternalId`, `scheme`, `serviceDate` | `workerExternalId` |
| Agreements | `participantExternalId`, `scheme`, `startDate` | `endDate` |
| Claims | `participantExternalId`, `scheme`, `serviceExternalId`, `serviceDate`, `claimAmount` | None |
| Invoices | `participantExternalId`, `scheme`, `invoiceDate`, `invoiceAmount` | None |
| Payments | `scheme`, `paymentDate`, `paymentAmount`, at least one of `claimExternalId` / `invoiceExternalId` | Either/both reference fields |
| Funding | `participantExternalId`, `scheme`, `startDate`, `endDate`, `fundingAmount` | None |
| Compliance document references | `workerExternalId`, `documentType` | `expiryDate` |

Schemes are `support_at_home` or `ndis`. Dates must exist, and end must not precede start. References must already be imported **in the same organisation and source system**; scheme/participant must match where supplied on both records. Import participants/workers before dependent records, services before claims, and claims/invoices before payments. Cross-source identity resolution is deferred. No full client management, document-content storage, reconciliation or compliance logic is implemented.

## Duplicates and immutable history

File checksums are checked across the organisation under an organisation-wide admission lock; repeating a file for the same source/type/format returns its existing job. Changing the source, record type or format of the same file returns conflict. The database also enforces `(organisation, source connection, checksum)` uniqueness. Mapping cannot change after processing begins. Correct rejected values in a new file; retrying the same completed job is a no-op.

Record identity is `(organisation, source connection, record type, externalId)`. Canonical mapped payload hashes identify unchanged snapshots. Financial amounts are canonical decimal strings. Fingerprints exclude `externalId` and `sourceUpdatedAt`; an equivalent record with another ID is conservatively rejected for review. Reference-only rows without descriptive fields are exempt from fingerprint checks. This heuristic may flag legitimate equivalent rows; no financial discrepancy conclusion is made.

Conflicting values for one ID inside a file are rejected. Identical repeated rows are unchanged. An existing ID with changed content is rejected unless the user explicitly approves **append new versions** before processing. New immutable SourceRecords preserve earlier payloads, import provenance and timestamps; no overwrite/delete is permitted. Future consumers must select the intended version, not sum all snapshots. Reimporting any historical identical snapshot is unchanged, not a rollback of the latest version.

One PostgreSQL advisory transaction lock per tenant/source serialises duplicate classification and writes. Source snapshots, row errors, counts, cursor and audit events commit together. A browser drives asynchronous POSTs of up to **50 rows per transaction**; each batch revalidates the live session and permissions. There is no detached in-process task, privileged worker or paid queue. Closing the browser pauses advancement; reopen history and **Resume import**. An interrupted transaction rolls back that batch, and retries start from the committed cursor. A storage/decryption failure marks Failed; restore configuration/storage before retrying. Sessions that expire or lose permissions cannot resume until reauthorised.

## Storage, auditing and API boundary

New `ImportFile`, `ImportMapping`, `ImportError` models extend existing `ImportJob`, `SourceRecord`, `IntegrationConnection`. Tenant composite foreign keys, indexes, bounds, RLS, narrow column grants and permission-aware INSERT policies are installed by additive migration. SourceRecords gain immutable UPDATE/DELETE/TRUNCATE protection. No database reset or existing row deletion occurs.

Within this local, bounded Stage 3 scope, files are stored as **AES-256-GCM encrypted PostgreSQL bytea**, rather than introducing the PRD's future object-storage service. A domain-separated HKDF key derives from the existing server encryption key; organisation/file UUID is authenticated additional data. Random nonces and authentication tags protect integrity. Encrypted file rows are immutable to the runtime role. There is no original-file download endpoint, public file path, filesystem extraction or external network request. This small-file adapter requires an approved encrypted object-storage/retention design before large or real datasets.

Existing append-only audit events record upload, validation, mapping, version policy, batch progress/completion, report access and duplicate-file reuse. Trigger events also cover import/source mutations. Metadata contains IDs, decisions and counts, never source cell values, filenames, credentials or tokens. Row error records contain row, field and fixed code only. Reports are protected attachment downloads with no-store/nosniff headers, omit original values and escape spreadsheet formula prefixes.

API prefix: `/api/organisations/:organisationId/imports`:

- GET: latest 100 jobs plus last successful record import per source.
- POST: raw `application/octet-stream`; validated `provider`, `dataType`, `filename` query parameters. Exact configured Origin required.
- GET `/:importId`: file metadata, headings, mapping, templates and error summary.
- PATCH `/:importId`: strict JSON mapping/date format/version policy/optional template name; returns preview.
- POST `/:importId/process`: strict JSON configuration token; processes one batch.
- GET `/:importId/report`: authorised CSV error report, no original imported values.

All mutations require exact same-origin checks. JSON bodies use the existing 16 KiB limit; uploads count actual streamed bytes. Queries are parameterised, tenant scoped and permission checked on the server. No frontend filtering is trusted for security.

## Remaining production work

This is a synthetic local import capability, not approval for real data or deployment. No background worker continues unattended after the browser closes. No vendor adapters, automatic scheduler, antivirus service, retention/deletion UI, object storage, cross-source identity matching or operational alerting is included. Keep the configured limits conservative. Before production, add ingress rate/time limits and measured concurrency/load budgets, approved retention/key rotation/backups, encrypted storage, and independent security/privacy review. Existing Stage 2 authentication recovery/CSP limitations remain. The subsequent user-approved Stage 3 demo release is documented in DEPLOYMENT.md.
