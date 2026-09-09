-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'STAT_CHANNELS';
ALTER TYPE "ModuleKey" ADD VALUE 'AI_CHAT';
ALTER TYPE "ModuleKey" ADD VALUE 'AI_MODERATION';
ALTER TYPE "ModuleKey" ADD VALUE 'SERVER_BACKUP';

-- CreateTable
CREATE TABLE "StatChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "statType" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT '{stat}: {count}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "chatChannelId" TEXT,
    "chatSystemPrompt" TEXT,
    "moderationEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerBackup" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatChannel_channelId_key" ON "StatChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConfig_guildId_key" ON "AiConfig"("guildId");

-- AddForeignKey
ALTER TABLE "StatChannel" ADD CONSTRAINT "StatChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConfig" ADD CONSTRAINT "AiConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerBackup" ADD CONSTRAINT "ServerBackup_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
