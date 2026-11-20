-- The schedule post shows a whole week (Mon-Sun), a week ahead by default.
ALTER TABLE "StreamExtrasConfig" ADD COLUMN IF NOT EXISTS "scheduleWeekAhead" BOOLEAN NOT NULL DEFAULT true;
