-- AlterTable
ALTER TABLE "ChannelLock" ADD COLUMN     "notifyContent" TEXT DEFAULT '{user}, that message isn''t allowed in {channel}.',
ADD COLUMN     "notifyEnabled" BOOLEAN NOT NULL DEFAULT false;
