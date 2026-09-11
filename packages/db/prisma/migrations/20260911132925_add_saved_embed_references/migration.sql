-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "BirthdayConfig" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "CustomCommand" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "CustomSlashCommand" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "EmbedCreatorPreset" ADD COLUMN     "lastSentChannelId" TEXT,
ADD COLUMN     "lastSentMessageId" TEXT,
ADD COLUMN     "lastSentMode" TEXT,
ADD COLUMN     "lastSentWebhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Giveaway" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "LfgCommand" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "StickyMessage" ADD COLUMN     "savedEmbedId" TEXT;

-- AlterTable
ALTER TABLE "WelcomeConfig" ADD COLUMN     "savedEmbedId" TEXT;
