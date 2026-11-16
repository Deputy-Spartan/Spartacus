-- Stream Growth: countdowns, friends & raids, live board, recaps, Viewer of the Week, game nights, connected accounts.
-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'STREAM_GROWTH';

-- AlterTable
ALTER TABLE "StreamSubscription" ADD COLUMN     "startFollowers" INTEGER,
ADD COLUMN     "streamFollows" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StreamSlot" ADD COLUMN     "remindHourFor" TIMESTAMP(3),
ADD COLUMN     "remindSoonFor" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StreamGrowthConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "countdownEnabled" BOOLEAN NOT NULL DEFAULT false,
    "countdownChannelId" TEXT,
    "pingRoleId" TEXT,
    "countdownHour" BOOLEAN NOT NULL DEFAULT true,
    "countdownSoon" BOOLEAN NOT NULL DEFAULT true,
    "raidChannelId" TEXT,
    "friendAlerts" BOOLEAN NOT NULL DEFAULT true,
    "raidListOnEnd" BOOLEAN NOT NULL DEFAULT true,
    "boardChannelId" TEXT,
    "boardMessageId" TEXT,
    "boardHash" TEXT,
    "recapEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recapChannelId" TEXT,
    "recapLinkedOnly" BOOLEAN NOT NULL DEFAULT true,
    "votwEnabled" BOOLEAN NOT NULL DEFAULT false,
    "votwChannelId" TEXT,
    "votwRoleId" TEXT,
    "votwDay" INTEGER NOT NULL DEFAULT 1,
    "votwLastWeek" TEXT,
    "gameNightChannelId" TEXT,
    "gameNightRoleId" TEXT,
    "checklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clipSubmitChannelId" TEXT,
    "ranksCreatedAt" TIMESTAMP(3),

    CONSTRAINT "StreamGrowthConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamFriend" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "offlineStrikes" INTEGER NOT NULL DEFAULT 0,
    "liveStartedAt" TIMESTAMP(3),
    "lastTitle" TEXT,
    "lastGame" TEXT,
    "lastViewers" INTEGER,
    "lastAvatar" TEXT,
    "lastUrl" TEXT,
    "alertMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamFriend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamerAccount" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "displayName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamViewerDay" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StreamViewerDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameNight" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "hostId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "note" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "teamSize" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "remindedAt" TIMESTAMP(3),
    "teams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameNightPlayer" (
    "id" TEXT NOT NULL,
    "gameNightId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameNightPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamGrowthConfig_guildId_key" ON "StreamGrowthConfig"("guildId");

-- CreateIndex
CREATE INDEX "StreamFriend_guildId_idx" ON "StreamFriend"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamFriend_guildId_platform_handle_key" ON "StreamFriend"("guildId", "platform", "handle");

-- CreateIndex
CREATE INDEX "StreamerAccount_platform_platformId_idx" ON "StreamerAccount"("platform", "platformId");

-- CreateIndex
CREATE INDEX "StreamerAccount_guildId_discordUserId_idx" ON "StreamerAccount"("guildId", "discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamerAccount_guildId_platform_platformId_key" ON "StreamerAccount"("guildId", "platform", "platformId");

-- CreateIndex
CREATE INDEX "StreamViewerDay_guildId_day_idx" ON "StreamViewerDay"("guildId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StreamViewerDay_guildId_userId_day_key" ON "StreamViewerDay"("guildId", "userId", "day");

-- CreateIndex
CREATE INDEX "GameNight_guildId_status_idx" ON "GameNight"("guildId", "status");

-- CreateIndex
CREATE INDEX "GameNight_status_startAt_idx" ON "GameNight"("status", "startAt");

-- CreateIndex
CREATE INDEX "GameNightPlayer_gameNightId_idx" ON "GameNightPlayer"("gameNightId");

-- CreateIndex
CREATE UNIQUE INDEX "GameNightPlayer_gameNightId_userId_key" ON "GameNightPlayer"("gameNightId", "userId");

