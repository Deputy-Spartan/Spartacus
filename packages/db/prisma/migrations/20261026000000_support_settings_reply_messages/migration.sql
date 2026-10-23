-- AlterTable
ALTER TABLE "SupportSettings"
  ADD COLUMN "alreadyOpenMessage" TEXT,
  ADD COLUMN "ticketOpenedMessage" TEXT,
  ADD COLUMN "ticketClaimedMessage" TEXT,
  ADD COLUMN "ticketClosedMessage" TEXT;
