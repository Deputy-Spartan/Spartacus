-- One schedule post per week (this week up to a month out), the active week at the bottom.
ALTER TABLE "StreamExtrasConfig" ADD COLUMN IF NOT EXISTS "scheduleWeeksAhead" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StreamExtrasConfig" ADD COLUMN IF NOT EXISTS "scheduleMessageIds" JSONB NOT NULL DEFAULT '[]';
