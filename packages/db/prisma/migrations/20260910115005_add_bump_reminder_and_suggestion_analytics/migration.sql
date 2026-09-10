-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'BUMP_REMINDER';
ALTER TYPE "ModuleKey" ADD VALUE 'SUGGESTION_ANALYTICS';

-- CreateTable
CREATE TABLE "BumpReminderSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "mentionRoleId" TEXT,
    "nextReminderAt" TIMESTAMP(3),
    "reminded" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BumpReminderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionAnalyticsSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,

    CONSTRAINT "SuggestionAnalyticsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BumpReminderSettings_guildId_key" ON "BumpReminderSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionAnalyticsSettings_guildId_key" ON "SuggestionAnalyticsSettings"("guildId");

-- AddForeignKey
ALTER TABLE "BumpReminderSettings" ADD CONSTRAINT "BumpReminderSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionAnalyticsSettings" ADD CONSTRAINT "SuggestionAnalyticsSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
