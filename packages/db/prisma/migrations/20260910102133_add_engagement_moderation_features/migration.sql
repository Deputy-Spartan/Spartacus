-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'WARN_ESCALATION';
ALTER TYPE "ModuleKey" ADD VALUE 'BAN_APPEALS';
ALTER TYPE "ModuleKey" ADD VALUE 'MOD_DIGEST';
ALTER TYPE "ModuleKey" ADD VALUE 'VOICE_ACTIVITY';
ALTER TYPE "ModuleKey" ADD VALUE 'WEEKLY_RECAP';
ALTER TYPE "ModuleKey" ADD VALUE 'ACHIEVEMENTS';

-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "manualStatusMessage" TEXT,
ADD COLUMN     "manualStatusOverride" TEXT;

-- CreateTable
CREATE TABLE "WarnEscalationSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "warnThreshold" INTEGER NOT NULL DEFAULT 3,
    "warnWindowDays" INTEGER NOT NULL DEFAULT 30,
    "action" TEXT NOT NULL DEFAULT 'TIMEOUT',
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "WarnEscalationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppealSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "appealChannelId" TEXT,

    CONSTRAINT "AppealSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModDigestSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,

    CONSTRAINT "ModDigestSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceSession" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceActivity" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VoiceActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyRecapSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,

    CONSTRAINT "WeeklyRecapSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarnEscalationSettings_guildId_key" ON "WarnEscalationSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AppealSettings_guildId_key" ON "AppealSettings"("guildId");

-- CreateIndex
CREATE INDEX "Appeal_guildId_status_idx" ON "Appeal"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ModDigestSettings_guildId_key" ON "ModDigestSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceSession_guildId_userId_key" ON "VoiceSession"("guildId", "userId");

-- CreateIndex
CREATE INDEX "VoiceActivity_guildId_totalMinutes_idx" ON "VoiceActivity"("guildId", "totalMinutes");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceActivity_guildId_userId_key" ON "VoiceActivity"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyRecapSettings_guildId_key" ON "WeeklyRecapSettings"("guildId");

-- CreateIndex
CREATE INDEX "Achievement_guildId_userId_idx" ON "Achievement"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_guildId_userId_type_key" ON "Achievement"("guildId", "userId", "type");

-- AddForeignKey
ALTER TABLE "WarnEscalationSettings" ADD CONSTRAINT "WarnEscalationSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppealSettings" ADD CONSTRAINT "AppealSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModDigestSettings" ADD CONSTRAINT "ModDigestSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceActivity" ADD CONSTRAINT "VoiceActivity_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyRecapSettings" ADD CONSTRAINT "WeeklyRecapSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
