-- AlterTable
ALTER TABLE "PlayerReportSettings"
  ADD COLUMN "dmCreateEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "dmCreateMessage" TEXT,
  ADD COLUMN "dmClaimEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "dmClaimMessage" TEXT,
  ADD COLUMN "dmCloseEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "dmCloseMessage" TEXT;
