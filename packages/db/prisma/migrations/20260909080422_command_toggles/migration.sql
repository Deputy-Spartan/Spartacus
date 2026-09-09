-- CreateTable
CREATE TABLE "CommandToggle" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CommandToggle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommandToggle_guildId_commandName_key" ON "CommandToggle"("guildId", "commandName");

-- AddForeignKey
ALTER TABLE "CommandToggle" ADD CONSTRAINT "CommandToggle_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
