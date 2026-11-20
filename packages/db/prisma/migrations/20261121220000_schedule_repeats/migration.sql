-- Stream schedule: repeats (once, daily, weekdays, weekends, weekly, every 2 weeks, monthly),
-- platforms with links and categories, a title and message, and the post's own look.
ALTER TABLE "StreamSlot" ADD COLUMN IF NOT EXISTS "repeat" TEXT NOT NULL DEFAULT 'WEEKLY';
ALTER TABLE "StreamSlot" ADD COLUMN IF NOT EXISTS "startDate" TEXT;
ALTER TABLE "StreamSlot" ADD COLUMN IF NOT EXISTS "streamTitle" TEXT;
ALTER TABLE "StreamSlot" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "StreamSlot" ADD COLUMN IF NOT EXISTS "platforms" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "StreamExtrasConfig" ADD COLUMN IF NOT EXISTS "scheduleEmbedId" TEXT;
