-- AlterTable
ALTER TABLE "PlayerReport"
  ADD COLUMN "messageId" TEXT,
  ADD COLUMN "channelId" TEXT,
  ADD COLUMN "claimedById" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "transcript" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "PlayerReport_channelId_key" ON "PlayerReport"("channelId");

-- CreateTable
CREATE TABLE "PlayerReportSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "reviewChannelId" TEXT,
    "staffRoleId" TEXT,

    CONSTRAINT "PlayerReportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerReportSettings_guildId_key" ON "PlayerReportSettings"("guildId");

-- AddForeignKey
ALTER TABLE "PlayerReportSettings" ADD CONSTRAINT "PlayerReportSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
