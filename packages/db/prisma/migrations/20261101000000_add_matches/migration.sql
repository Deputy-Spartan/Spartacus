-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'MATCHES';

-- CreateTable
CREATE TABLE "MatchSetup" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "format" TEXT NOT NULL DEFAULT 'SINGLE',
    "teamSize" INTEGER NOT NULL DEFAULT 5,
    "tournamentTeams" INTEGER NOT NULL DEFAULT 4,
    "balance" TEXT NOT NULL DEFAULT 'BALANCED',
    "captainRule" TEXT NOT NULL DEFAULT 'TOP',
    "team1Name" TEXT NOT NULL DEFAULT 'Team Blue',
    "team2Name" TEXT NOT NULL DEFAULT 'Team Orange',
    "useRanks" BOOLEAN NOT NULL DEFAULT false,
    "ranks" JSONB NOT NULL DEFAULT '[]',
    "scoreName" TEXT NOT NULL DEFAULT 'Rounds',
    "useMaps" BOOLEAN NOT NULL DEFAULT false,
    "mapWord" TEXT NOT NULL DEFAULT 'Map',
    "maps" JSONB NOT NULL DEFAULT '[]',
    "mapMethod" TEXT NOT NULL DEFAULT 'VOTE',
    "mapChoices" INTEGER NOT NULL DEFAULT 3,
    "voteSeconds" INTEGER NOT NULL DEFAULT 60,
    "skipRecent" INTEGER NOT NULL DEFAULT 0,
    "checkIn" BOOLEAN NOT NULL DEFAULT true,
    "checkInSeconds" INTEGER NOT NULL DEFAULT 120,
    "autoMove" BOOLEAN NOT NULL DEFAULT true,
    "reportBy" TEXT NOT NULL DEFAULT 'BOTH',
    "lobbyVoiceId" TEXT,
    "team1VoiceId" TEXT,
    "team2VoiceId" TEXT,
    "winCoins" INTEGER NOT NULL DEFAULT 100,
    "lossCoins" INTEGER NOT NULL DEFAULT 25,
    "championCoins" INTEGER NOT NULL DEFAULT 500,
    "championRoleId" TEXT,
    "pingRoleId" TEXT,
    "staffRoleId" TEXT,
    "panelChannelId" TEXT NOT NULL,
    "resultsChannelId" TEXT NOT NULL,
    "panelMessageId" TEXT,
    "leaderboardMessageId" TEXT,
    "bracketMessageId" TEXT,
    "season" INTEGER NOT NULL DEFAULT 1,
    "nextMatchNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSession" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "phaseEndsAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "tournamentWins" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "map" TEXT,
    "winnerName" TEXT NOT NULL,
    "loserName" TEXT NOT NULL,
    "winnerScore" INTEGER NOT NULL,
    "loserScore" INTEGER NOT NULL,
    "winners" JSONB NOT NULL,
    "losers" JSONB NOT NULL,
    "winCoins" INTEGER NOT NULL DEFAULT 0,
    "lossCoins" INTEGER NOT NULL DEFAULT 0,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchSetup_guildId_idx" ON "MatchSetup"("guildId");

-- CreateIndex
CREATE INDEX "MatchSession_setupId_closedAt_idx" ON "MatchSession"("setupId", "closedAt");

-- CreateIndex
CREATE INDEX "MatchSession_phaseEndsAt_idx" ON "MatchSession"("phaseEndsAt");

-- CreateIndex
CREATE INDEX "MatchPlayer_setupId_wins_idx" ON "MatchPlayer"("setupId", "wins");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_setupId_userId_key" ON "MatchPlayer"("setupId", "userId");

-- CreateIndex
CREATE INDEX "MatchResult_setupId_createdAt_idx" ON "MatchResult"("setupId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchSetup" ADD CONSTRAINT "MatchSetup_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSession" ADD CONSTRAINT "MatchSession_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "MatchSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "MatchSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "MatchSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

