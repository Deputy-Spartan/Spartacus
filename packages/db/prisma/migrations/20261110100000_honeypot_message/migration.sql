-- AlterTable
ALTER TABLE "HoneypotConfig" ADD COLUMN     "action" TEXT NOT NULL DEFAULT 'BAN',
ADD COLUMN     "timeoutMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "deleteMessage" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "messageEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "creatorData" JSONB,
ADD COLUMN     "savedEmbedId" TEXT,
ADD COLUMN     "showCounter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "counterScope" TEXT NOT NULL DEFAULT 'SERVER',
ADD COLUMN     "showStatsButton" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "HoneypotCatch" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoneypotCatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoneypotCatch_guildId_createdAt_idx" ON "HoneypotCatch"("guildId", "createdAt");

-- Count the bans the honeypot already made, so counters don't start at zero.
INSERT INTO "HoneypotCatch" ("id", "guildId", "userId", "action", "createdAt")
SELECT 'hp_' || "id", "guildId", "userId", 'BAN', "createdAt"
FROM "ModerationCase"
WHERE "action" = 'BAN' AND "reason" = 'Honeypot channel triggered';
