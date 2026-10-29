-- AlterTable
ALTER TABLE "PlayerReport"
  ADD COLUMN "reportNumber" INTEGER;

-- AlterTable
ALTER TABLE "PlayerReportSettings"
  DROP COLUMN "reviewChannelId",
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "channelNameFormat" TEXT NOT NULL DEFAULT 'report-{number}',
  ADD COLUMN "reportCounter" INTEGER NOT NULL DEFAULT 0;
