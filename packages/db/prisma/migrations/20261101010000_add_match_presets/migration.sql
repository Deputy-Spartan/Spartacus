-- CreateTable
CREATE TABLE "MatchPreset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "teamSize" INTEGER NOT NULL DEFAULT 5,
    "useRanks" BOOLEAN NOT NULL DEFAULT false,
    "ranks" JSONB NOT NULL DEFAULT '[]',
    "useMaps" BOOLEAN NOT NULL DEFAULT false,
    "maps" JSONB NOT NULL DEFAULT '[]',
    "mapWord" TEXT NOT NULL DEFAULT 'Map',
    "scoreName" TEXT NOT NULL DEFAULT 'Points',
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchPreset_guildId_game_key" ON "MatchPreset"("guildId", "game");

-- AddForeignKey
ALTER TABLE "MatchPreset" ADD CONSTRAINT "MatchPreset_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

