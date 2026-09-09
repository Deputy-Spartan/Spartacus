-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "username" TEXT,
    "description" TEXT,
    "statusType" TEXT NOT NULL DEFAULT 'online',
    "activityType" TEXT NOT NULL DEFAULT 'PLAYING',
    "activityText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);
