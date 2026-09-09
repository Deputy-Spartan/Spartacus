-- CreateTable
CREATE TABLE "SavedEmbed" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "embedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "embedColor" TEXT DEFAULT '#00E5FF',
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedEmbed_guildId_name_key" ON "SavedEmbed"("guildId", "name");

-- AddForeignKey
ALTER TABLE "SavedEmbed" ADD CONSTRAINT "SavedEmbed_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
