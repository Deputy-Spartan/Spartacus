-- The command list post (Custom Commands › Command list).
CREATE TABLE IF NOT EXISTS "CommandListSettings" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT,
  "style" TEXT NOT NULL DEFAULT 'EMBED',
  "autoUpdate" BOOLEAN NOT NULL DEFAULT true,
  "includeStaff" BOOLEAN NOT NULL DEFAULT true,
  "includeCustom" BOOLEAN NOT NULL DEFAULT true,
  "onlyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "messageIds" JSONB NOT NULL DEFAULT '[]',
  "hash" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommandListSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommandListSettings_guildId_key" ON "CommandListSettings"("guildId");
