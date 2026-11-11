ALTER TYPE "ModuleKey" ADD VALUE 'STREAM_EXTRAS';
-- Stream Extras: clips, stream schedule, and viewer rewards from Twitch chat.
CREATE TABLE "StreamExtrasConfig" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "clipsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "clipsChannelId" TEXT,
  "clipsMinViews" INTEGER NOT NULL DEFAULT 0,
  "clipsWeekly" BOOLEAN NOT NULL DEFAULT true,
  "clipsWeeklyDay" INTEGER NOT NULL DEFAULT 0,
  "lastClipOfWeekAt" TIMESTAMP(3),
  "scheduleChannelId" TEXT,
  "scheduleMessageId" TEXT,
  "scheduleTimezone" TEXT NOT NULL DEFAULT 'UTC',
  "scheduleCreateEvents" BOOLEAN NOT NULL DEFAULT false,
  "scheduleHash" TEXT,
  "rewardsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "rewardCoins" INTEGER NOT NULL DEFAULT 10,
  "rewardXp" INTEGER NOT NULL DEFAULT 10,
  "rewardIntervalMin" INTEGER NOT NULL DEFAULT 10,
  "rewardDailyCoinCap" INTEGER NOT NULL DEFAULT 200,
  CONSTRAINT "StreamExtrasConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamExtrasConfig_guildId_key" ON "StreamExtrasConfig"("guildId");

CREATE TABLE "StreamClip" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'twitch',
  "clipId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "creator" TEXT,
  "streamer" TEXT,
  "thumbnail" TEXT,
  "views" INTEGER NOT NULL DEFAULT 0,
  "channelId" TEXT,
  "messageId" TEXT,
  "votes" INTEGER NOT NULL DEFAULT 0,
  "clippedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StreamClip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamClip_guildId_platform_clipId_key" ON "StreamClip"("guildId", "platform", "clipId");
CREATE INDEX "StreamClip_guildId_clippedAt_idx" ON "StreamClip"("guildId", "clippedAt");

CREATE TABLE "StreamClipVote" (
  "id" TEXT NOT NULL,
  "clipId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "StreamClipVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamClipVote_clipId_userId_key" ON "StreamClipVote"("clipId", "userId");

CREATE TABLE "StreamSlot" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT,
  "streamer" TEXT NOT NULL,
  "title" TEXT,
  "link" TEXT,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinutes" INTEGER NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 120,
  "discordEventId" TEXT,
  "eventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StreamSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StreamSlot_guildId_idx" ON "StreamSlot"("guildId");

CREATE TABLE "StreamLink" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'twitch',
  "handle" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StreamLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamLink_guildId_platform_handle_key" ON "StreamLink"("guildId", "platform", "handle");
CREATE UNIQUE INDEX "StreamLink_guildId_userId_platform_key" ON "StreamLink"("guildId", "userId", "platform");
CREATE INDEX "StreamLink_guildId_verified_idx" ON "StreamLink"("guildId", "verified");

CREATE TABLE "StreamRewardDay" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "coins" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "StreamRewardDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamRewardDay_guildId_userId_day_key" ON "StreamRewardDay"("guildId", "userId", "day");
