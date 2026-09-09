-- AlterTable
ALTER TABLE "EconomyBalance" ADD COLUMN     "dailyStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastMessageEarnAt" TIMESTAMP(3),
ADD COLUMN     "totalEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSpent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EconomyConfig" ADD COLUMN     "channelMultipliers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dailyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "earnOnMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "embedColor" TEXT NOT NULL DEFAULT '#E8C547',
ADD COLUMN     "maxBalance" INTEGER NOT NULL DEFAULT 1000000000,
ADD COLUMN     "messageCooldownSec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minMessageLength" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "roleMultipliers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "streakBonusPerDay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakCapDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "transferMinAmount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "transferTaxPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transfersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EconomyTransaction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EconomyTransaction_guildId_createdAt_idx" ON "EconomyTransaction"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "EconomyTransaction" ADD CONSTRAINT "EconomyTransaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
