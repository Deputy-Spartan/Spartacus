-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'QOTD';

-- CreateTable
CREATE TABLE "DailyPostConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "pingRoleId" TEXT,
    "postTime" TEXT NOT NULL DEFAULT '09:00',
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "days" JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    "order" TEXT NOT NULL DEFAULT 'RANDOM',
    "useBuiltIn" BOOLEAN NOT NULL DEFAULT true,
    "usedBuiltIn" JSONB NOT NULL DEFAULT '[]',
    "createThread" BOOLEAN NOT NULL DEFAULT false,
    "creatorData" JSONB,
    "savedEmbedId" TEXT,
    "lastPostedOn" TEXT,
    "postCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyPostConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPostEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPostConfig_guildId_kind_key" ON "DailyPostConfig"("guildId", "kind");

-- CreateIndex
CREATE INDEX "DailyPostEntry_guildId_kind_idx" ON "DailyPostEntry"("guildId", "kind");

-- AddForeignKey
ALTER TABLE "DailyPostConfig" ADD CONSTRAINT "DailyPostConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPostEntry" ADD CONSTRAINT "DailyPostEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
