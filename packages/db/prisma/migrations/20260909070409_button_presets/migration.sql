-- CreateTable
CREATE TABLE "ButtonPreset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButtonPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ButtonPreset_guildId_name_key" ON "ButtonPreset"("guildId", "name");

-- AddForeignKey
ALTER TABLE "ButtonPreset" ADD CONSTRAINT "ButtonPreset_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
