-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'ANNOUNCEMENTS';
ALTER TYPE "ModuleKey" ADD VALUE 'SLOW_MODE';
ALTER TYPE "ModuleKey" ADD VALUE 'BIRTHDAYS';

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT,
    "embedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "embedTitle" TEXT,
    "embedColor" TEXT DEFAULT '#00E5FF',
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoPurgeConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "ignorePinned" BOOLEAN NOT NULL DEFAULT true,
    "ignoreImages" BOOLEAN NOT NULL DEFAULT false,
    "ignoreLinks" BOOLEAN NOT NULL DEFAULT false,
    "protectedEmojis" JSONB NOT NULL DEFAULT '[]',
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "AutoPurgeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BirthdayConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "embedTitle" TEXT DEFAULT '🎂 Happy Birthday!',
    "embedMessage" TEXT DEFAULT 'Everyone wish {user} a happy birthday! 🎉',
    "embedColor" TEXT DEFAULT '#FF69B4',
    "pingRoleId" TEXT,

    CONSTRAINT "BirthdayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Birthday" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,

    CONSTRAINT "Birthday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_guildId_sentAt_idx" ON "Announcement"("guildId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoPurgeConfig_channelId_key" ON "AutoPurgeConfig"("channelId");

-- CreateIndex
CREATE INDEX "AutoPurgeConfig_guildId_idx" ON "AutoPurgeConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayConfig_guildId_key" ON "BirthdayConfig"("guildId");

-- CreateIndex
CREATE INDEX "Birthday_guildId_month_day_idx" ON "Birthday"("guildId", "month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Birthday_guildId_userId_key" ON "Birthday"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPurgeConfig" ADD CONSTRAINT "AutoPurgeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayConfig" ADD CONSTRAINT "BirthdayConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Birthday" ADD CONSTRAINT "Birthday_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
