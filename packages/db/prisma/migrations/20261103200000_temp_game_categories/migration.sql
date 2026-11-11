-- AlterTable
ALTER TABLE "TempChannelLobby" ADD COLUMN     "gameCategories" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TempGameCategory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempGameCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TempGameCategory_categoryId_key" ON "TempGameCategory"("categoryId");

-- CreateIndex
CREATE INDEX "TempGameCategory_guildId_idx" ON "TempGameCategory"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TempGameCategory_lobbyId_label_key" ON "TempGameCategory"("lobbyId", "label");
