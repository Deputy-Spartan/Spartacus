-- Bump Reminder: people who get a DM when the bump is ready.
ALTER TABLE "BumpReminderSettings" ADD COLUMN "dmUserIds" JSONB NOT NULL DEFAULT '[]';
