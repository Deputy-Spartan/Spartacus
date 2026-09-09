-- AlterTable
ALTER TABLE "ChannelLock" ADD COLUMN     "dmUser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyButtons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "notifyContent" TEXT DEFAULT '{user}, that message isn''t allowed in {channel}.',
ADD COLUMN     "notifyDeleteAfterSec" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "notifyEmbedColor" TEXT DEFAULT '#00E5FF',
ADD COLUMN     "notifyEmbedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyEmbedTitle" TEXT,
ADD COLUMN     "notifyEnabled" BOOLEAN NOT NULL DEFAULT false;
