-- More messages that get their own embed ("Build here" / "Use a saved embed").
ALTER TABLE "LevelingSettings" ADD COLUMN "savedEmbedId" TEXT;
ALTER TABLE "ChannelLock" ADD COLUMN "savedEmbedId" TEXT;
ALTER TABLE "Event" ADD COLUMN "savedEmbedId" TEXT;
