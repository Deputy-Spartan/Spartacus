-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "lastDeployAt" TIMESTAMP(3),
ADD COLUMN     "lastDeployCommit" TEXT;

-- CreateTable
CREATE TABLE "AlertSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "errorChannelId" TEXT,
    "deployChannelId" TEXT,
    "uptimeChannelId" TEXT,

    CONSTRAINT "AlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UptimeIncident" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "UptimeIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertSettings_guildId_key" ON "AlertSettings"("guildId");

-- AddForeignKey
ALTER TABLE "AlertSettings" ADD CONSTRAINT "AlertSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
