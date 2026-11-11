ALTER TABLE "StreamSubscription" ADD COLUMN "displayName" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "platformName" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "discordUserId" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "pingRoleId" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "liveMessageId" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "liveStartedAt" TIMESTAMP(3);
ALTER TABLE "StreamSubscription" ADD COLUMN "lastTitle" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "lastGame" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "lastThumbnail" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "lastAvatar" TEXT;
ALTER TABLE "StreamSubscription" ADD COLUMN "peakViewers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StreamSubscription" ADD COLUMN "offlineStrikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StreamSubscription" ADD COLUMN "lastError" TEXT;

CREATE TABLE "StreamAlertSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "defaultChannelId" TEXT,
    "pingRoleId" TEXT,
    "liveRoleId" TEXT,
    "selfServeRoleId" TEXT,
    "contentTemplate" TEXT,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "embedColor" TEXT,
    "buttonLabel" TEXT,
    "showThumbnail" BOOLEAN NOT NULL DEFAULT true,
    "updateWhileLive" BOOLEAN NOT NULL DEFAULT true,
    "endAction" TEXT NOT NULL DEFAULT 'EDIT',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    CONSTRAINT "StreamAlertSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamAlertSettings_guildId_key" ON "StreamAlertSettings"("guildId");
