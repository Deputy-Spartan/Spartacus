-- AlterTable
ALTER TABLE "TicketSettings" ADD COLUMN     "channelNameFormat" TEXT NOT NULL DEFAULT 'ticket-{user}';
