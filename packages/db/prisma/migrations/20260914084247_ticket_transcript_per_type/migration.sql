-- CreateEnum
CREATE TYPE "TicketCloseBehavior" AS ENUM ('DELETE_AND_DM', 'POST_ONLY');

-- AlterTable
ALTER TABLE "TicketSettings" ADD COLUMN     "closeBehavior" "TicketCloseBehavior" NOT NULL DEFAULT 'DELETE_AND_DM';

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "closeBehavior" "TicketCloseBehavior",
ADD COLUMN     "transcriptChannelId" TEXT;
