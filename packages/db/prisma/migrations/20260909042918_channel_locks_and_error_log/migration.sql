-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'CHANNEL_LOCKS';

-- CreateTable
CREATE TABLE "ChannelLock" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "allowImages" BOOLEAN NOT NULL DEFAULT true,
    "allowLinks" BOOLEAN NOT NULL DEFAULT true,
    "allowFiles" BOOLEAN NOT NULL DEFAULT true,
    "allowMessages" BOOLEAN NOT NULL DEFAULT true,
    "slashCommandsOnly" BOOLEAN NOT NULL DEFAULT false,
    "requiredPrefixes" JSONB NOT NULL DEFAULT '[]',
    "bannedWords" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLock_channelId_key" ON "ChannelLock"("channelId");

-- CreateIndex
CREATE INDEX "ErrorLog_guildId_createdAt_idx" ON "ErrorLog"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelLock" ADD CONSTRAINT "ChannelLock_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
