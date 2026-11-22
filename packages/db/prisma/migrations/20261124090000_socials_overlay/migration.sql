-- CreateTable
CREATE TABLE "SocialsOverlay" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "style" TEXT NOT NULL DEFAULT 'sticker',
    "pos" TEXT NOT NULL DEFAULT 'left',
    "size" INTEGER NOT NULL DEFAULT 100,
    "hold" INTEGER NOT NULL DEFAULT 0,
    "every" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialsOverlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialsOverlay_guildId_key" ON "SocialsOverlay"("guildId");
