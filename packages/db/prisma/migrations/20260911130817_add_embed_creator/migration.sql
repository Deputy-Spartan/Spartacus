-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'EMBED_CREATOR';

-- CreateTable
CREATE TABLE "EmbedCreatorPreset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbedCreatorPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmbedCreatorPreset_guildId_name_key" ON "EmbedCreatorPreset"("guildId", "name");

-- AddForeignKey
ALTER TABLE "EmbedCreatorPreset" ADD CONSTRAINT "EmbedCreatorPreset_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
