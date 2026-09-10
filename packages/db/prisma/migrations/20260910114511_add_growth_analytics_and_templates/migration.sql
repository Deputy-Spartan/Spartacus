-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'GROWTH_ANALYTICS';
ALTER TYPE "ModuleKey" ADD VALUE 'SERVER_TEMPLATES';

-- CreateTable
CREATE TABLE "GrowthSnapshot" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMessageCount" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyMessageCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthSnapshot_guildId_createdAt_idx" ON "GrowthSnapshot"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMessageCount_guildId_date_key" ON "DailyMessageCount"("guildId", "date");

-- AddForeignKey
ALTER TABLE "GrowthSnapshot" ADD CONSTRAINT "GrowthSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
