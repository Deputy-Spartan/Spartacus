-- Rename + convert rather than drop+recreate, so any server that already
-- configured a custom purge interval keeps the same effective interval
-- (just expressed in seconds now) instead of silently reverting to the
-- 60-minute default.
ALTER TABLE "AutoPurgeConfig" RENAME COLUMN "intervalMinutes" TO "intervalSeconds";
ALTER TABLE "AutoPurgeConfig" ALTER COLUMN "intervalSeconds" SET DEFAULT 3600;
UPDATE "AutoPurgeConfig" SET "intervalSeconds" = "intervalSeconds" * 60;
