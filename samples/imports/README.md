# Synthetic import samples

All IDs, names, services and amounts are fictional. Never substitute real provider records in development. Each numbered sample has equivalent CSV and XLSX versions; import **one format**, using **CSV as the source system for every file** so relationships resolve within one source. The source-system selector describes provenance, not the file extension.

1. `01-participants`: Participants / clients; two valid references.
2. `02-workers`: Worker records; one valid reference.
3. `03-support-at-home-services`: Service records; one valid, one missing participant, one impossible date.
4. `04-support-at-home-claims`: Claims; one valid claim, an identical repeated claim (unchanged), invalid text amount, and missing participant/invalid decimal precision.
5. `05-payment-remittances`: Payments / remittances; one valid payment and one missing claim reference.
6. `06-ndis-services`: Service records; one valid ISO date and one Australian text date. Choose ISO to reject the ambiguous text; dates are never guessed.
7. `07-worker-compliance`: Compliance document references; one valid reference and one missing worker/impossible expiry date. No compliance assessment is performed.
8. `08-missing-columns`: Service records; deliberately lacks required mapping columns.

Choose **ISO dates**, review suggested headings, then Validate and preview → Import valid records. The claims sample maps `Client ID` to `participantExternalId`, `Service Date` to `serviceDate`, and `Amount` to `claimAmount`.

Files under `tests/fixtures/imports` are rejection fixtures (macros, formulas, links, malformed paths, entities, expansion and sparse-coordinate attacks). They are intentionally unsuitable for importing. Recreate all samples with `python scripts/generate-import-samples.py`; it uses only Python's standard library.
