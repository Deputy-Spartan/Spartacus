CREATE TABLE "BotLeader" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BotLeader_pkey" PRIMARY KEY ("id")
);
