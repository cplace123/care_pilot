-- Additive invariant: each committed row has exactly one terminal outcome.
ALTER TABLE "ImportJob" ADD CONSTRAINT import_count_consistency CHECK (
 "successCount" + "rejectedCount" + "unchangedCount" = "processedCount"
 AND "updatedCount" <= "successCount"
);
