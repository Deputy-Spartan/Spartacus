-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'RANK_CARDS';
ALTER TYPE "ModuleKey" ADD VALUE 'CONFESSIONS';
ALTER TYPE "ModuleKey" ADD VALUE 'MEMBER_MILESTONES';
ALTER TYPE "ModuleKey" ADD VALUE 'RULES_GATE';
ALTER TYPE "ModuleKey" ADD VALUE 'PRESTIGE';
ALTER TYPE "ModuleKey" ADD VALUE 'REMINDERS';

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "BirthdayConfig" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "CustomCommand" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "CustomSlashCommand" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "Giveaway" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "MemberXp" ADD COLUMN     "prestige" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SavedEmbed" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "StickyMessage" ADD COLUMN     "embedExtra" JSONB;

-- AlterTable
ALTER TABLE "WarnEscalationSettings" ADD COLUMN     "scaleDuration" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WelcomeConfig" ADD COLUMN     "embedExtra" JSONB;

-- CreateTable
CREATE TABLE "ConfessionSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ConfessionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,

    CONSTRAINT "MilestoneSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesGateSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "roleId" TEXT,

    CONSTRAINT "RulesGateSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrestigeSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "maxLevel" INTEGER NOT NULL DEFAULT 50,
    "roleId" TEXT,

    CONSTRAINT "PrestigeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfessionSettings_guildId_key" ON "ConfessionSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneSettings_guildId_key" ON "MilestoneSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "RulesGateSettings_guildId_key" ON "RulesGateSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "PrestigeSettings_guildId_key" ON "PrestigeSettings"("guildId");

-- CreateIndex
CREATE INDEX "Reminder_remindAt_idx" ON "Reminder"("remindAt");

-- AddForeignKey
ALTER TABLE "ConfessionSettings" ADD CONSTRAINT "ConfessionSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneSettings" ADD CONSTRAINT "MilestoneSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulesGateSettings" ADD CONSTRAINT "RulesGateSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestigeSettings" ADD CONSTRAINT "PrestigeSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
