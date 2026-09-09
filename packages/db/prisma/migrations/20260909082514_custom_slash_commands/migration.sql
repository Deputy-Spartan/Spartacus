-- CreateTable
CREATE TABLE "CustomSlashCommand" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discordCommandId" TEXT,
    "actionType" TEXT NOT NULL,
    "ephemeralReply" BOOLEAN NOT NULL DEFAULT true,
    "messageText" TEXT,
    "roleId" TEXT,
    "currencyAmount" INTEGER,
    "embedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "embedColor" TEXT,
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomSlashCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomSlashCommand_guildId_name_key" ON "CustomSlashCommand"("guildId", "name");

-- AddForeignKey
ALTER TABLE "CustomSlashCommand" ADD CONSTRAINT "CustomSlashCommand_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
