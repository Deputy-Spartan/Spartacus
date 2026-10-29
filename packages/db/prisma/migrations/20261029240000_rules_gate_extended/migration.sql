CREATE TYPE "RulesGateDeclineAction" AS ENUM ('NONE', 'KICK', 'CHANNEL');

ALTER TABLE "RulesGateSettings"
  ADD COLUMN "rulesVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "minAccountAgeDays" INTEGER,
  ADD COLUMN "accountTooNewMessage" TEXT,
  ADD COLUMN "declineEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "declineAction" "RulesGateDeclineAction" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "declineChannelId" TEXT,
  ADD COLUMN "declineReplyMessage" TEXT,
  ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminderDelayHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "reminderMessage" TEXT,
  ADD COLUMN "defaultEmbedTitle" TEXT,
  ADD COLUMN "defaultEmbedDescription" TEXT;

ALTER TABLE "RulesGateAgreement"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "sectionId" TEXT;

CREATE TABLE "RulesGateSection" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RulesGateSection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RulesGateSection" ADD CONSTRAINT "RulesGateSection_settingsId_fkey"
    FOREIGN KEY ("settingsId") REFERENCES "RulesGateSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RulesGatePendingMember" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "RulesGatePendingMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RulesGatePendingMember_guildId_userId_key" ON "RulesGatePendingMember"("guildId", "userId");
