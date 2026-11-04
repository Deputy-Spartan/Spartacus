ALTER TABLE "BumpReminderSettings" ADD COLUMN "statusMessageId" TEXT;
ALTER TABLE "BumpReminderSettings" ADD COLUMN "bumpMessages" JSONB;
ALTER TABLE "BumpReminderSettings" ADD COLUMN "bumpCount" INTEGER NOT NULL DEFAULT 0;
