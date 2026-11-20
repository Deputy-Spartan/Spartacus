-- Command list: staff commands can go to their own (staff-only) channel.
ALTER TABLE "CommandListSettings" ADD COLUMN IF NOT EXISTS "staffChannelId" TEXT;
ALTER TABLE "CommandListSettings" ADD COLUMN IF NOT EXISTS "staffMessageIds" JSONB NOT NULL DEFAULT '[]';
