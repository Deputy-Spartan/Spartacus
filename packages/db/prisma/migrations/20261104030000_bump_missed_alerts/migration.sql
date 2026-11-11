ALTER TABLE "BumpReminderSettings" ADD COLUMN "lastBumpAt" TIMESTAMP(3);
ALTER TABLE "BumpReminderSettings" ADD COLUMN "lastBumpedById" TEXT;
ALTER TABLE "BumpReminderSettings" ADD COLUMN "missedAlertEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BumpReminderSettings" ADD COLUMN "missedAfterMin" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "BumpReminderSettings" ADD COLUMN "missedAlerts" INTEGER NOT NULL DEFAULT 0;
