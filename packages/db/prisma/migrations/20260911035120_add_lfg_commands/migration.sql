-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'LFG';

-- CreateTable
CREATE TABLE "LfgCommand" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT 'Post that you''re looking for a group.',
    "discordCommandId" TEXT,
    "channelId" TEXT NOT NULL,
    "roleId" TEXT,
    "includeSender" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'plain',
    "message" TEXT,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "embedColor" TEXT,
    "embedExtra" JSONB,
    "errorMessage" TEXT NOT NULL DEFAULT 'You need to be in a voice channel to use this command.',
    "wrongChannelMessage" TEXT NOT NULL DEFAULT 'This command can only be used in {channel}.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LfgCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LfgCommand_guildId_trigger_key" ON "LfgCommand"("guildId", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "LfgCommand_guildId_channelId_key" ON "LfgCommand"("guildId", "channelId");

-- AddForeignKey
ALTER TABLE "LfgCommand" ADD CONSTRAINT "LfgCommand_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
