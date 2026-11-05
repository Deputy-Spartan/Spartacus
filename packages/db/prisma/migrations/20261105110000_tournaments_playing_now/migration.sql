-- Playing Now module
ALTER TYPE "ModuleKey" ADD VALUE 'PLAYING_NOW';

-- Matchmaking tournaments
CREATE TABLE "MatchTournament" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "maxTeams" INTEGER NOT NULL DEFAULT 8,
    "bestOf" TEXT NOT NULL DEFAULT 'BO1F3',
    "seeding" TEXT NOT NULL DEFAULT 'RECORD',
    "checkIn" BOOLEAN NOT NULL DEFAULT true,
    "checkInMinutes" INTEGER NOT NULL DEFAULT 15,
    "soloSignups" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "checkInEndsAt" TIMESTAMP(3),
    "channelId" TEXT,
    "messageId" TEXT,
    "pingRoleId" TEXT,
    "rules" TEXT,
    "winCoins" INTEGER NOT NULL DEFAULT 100,
    "championCoins" INTEGER NOT NULL DEFAULT 500,
    "runnerUpCoins" INTEGER NOT NULL DEFAULT 150,
    "championRoleId" TEXT,
    "solo" JSONB NOT NULL DEFAULT '[]',
    "soloReady" JSONB NOT NULL DEFAULT '[]',
    "bracket" JSONB NOT NULL DEFAULT '[]',
    "championEntryId" TEXT,
    "runnerUpEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "MatchTournament_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatchTournament_guildId_status_idx" ON "MatchTournament"("guildId", "status");
CREATE INDEX "MatchTournament_status_startAt_idx" ON "MatchTournament"("status", "startAt");

CREATE TABLE "MatchTournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "players" JSONB NOT NULL DEFAULT '[]',
    "seed" INTEGER,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "out" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchTournamentEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatchTournamentEntry_tournamentId_idx" ON "MatchTournamentEntry"("tournamentId");
ALTER TABLE "MatchTournamentEntry" ADD CONSTRAINT "MatchTournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "MatchTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchRoom" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "MatchRoom" ADD COLUMN "tieRound" INTEGER;
ALTER TABLE "MatchRoom" ADD COLUMN "tieIndex" INTEGER;
ALTER TABLE "MatchmakingConfig" ADD COLUMN "championRoleId" TEXT;

-- Tournament setups from Matches move to Matchmaking → Tournaments as drafts
-- (nothing is lost: same name, game, size limit, rewards and channel).
INSERT INTO "MatchTournament" ("id", "guildId", "name", "game", "maxTeams", "checkIn", "channelId", "pingRoleId", "winCoins", "championCoins", "championRoleId")
SELECT 'mt_' || "id", "guildId", "name", "game",
       CASE WHEN "tournamentTeams" IN (4, 8, 16, 32) THEN "tournamentTeams" WHEN "tournamentTeams" = 2 THEN 4 ELSE 32 END,
       "checkIn", "panelChannelId", "pingRoleId", "winCoins", "championCoins", "championRoleId"
FROM "MatchSetup" WHERE "format" = 'TOURNAMENT';
UPDATE "MatchmakingConfig" c SET "championRoleId" = s."championRoleId"
FROM (SELECT DISTINCT ON ("guildId") "guildId", "championRoleId" FROM "MatchSetup" WHERE "championRoleId" IS NOT NULL ORDER BY "guildId", "createdAt" DESC) s
WHERE c."guildId" = s."guildId" AND c."championRoleId" IS NULL;
-- The old setups stay (their results and leaderboard rows point at them),
-- turned into switched-off single matches you can delete.
UPDATE "MatchSession" SET "closedAt" = CURRENT_TIMESTAMP, "phaseEndsAt" = NULL WHERE "kind" = 'TOURNAMENT' AND "closedAt" IS NULL;
UPDATE "MatchSetup" SET "enabled" = false, "name" = LEFT("name" || ' (moved to Tournaments)', 100) WHERE "format" = 'TOURNAMENT';

ALTER TABLE "MatchSetup" DROP COLUMN "format";
ALTER TABLE "MatchSetup" DROP COLUMN "teamNames";
ALTER TABLE "MatchSetup" DROP COLUMN "tournamentTeams";
ALTER TABLE "MatchSetup" DROP COLUMN "flexTeams";
ALTER TABLE "MatchSetup" DROP COLUMN "autoReopenHours";
ALTER TABLE "MatchSetup" DROP COLUMN "championCoins";
ALTER TABLE "MatchSetup" DROP COLUMN "championRoleId";
ALTER TABLE "MatchSetup" DROP COLUMN "bracketMessageId";
ALTER TABLE "MatchPlayer" DROP COLUMN "tournamentWins";

-- Playing Now
CREATE TABLE "PlayingNowConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "panelMessageId" TEXT,
    "roleId" TEXT,
    "notifyRoleId" TEXT,
    "maxMinutes" INTEGER NOT NULL DEFAULT 120,
    "pingCooldown" INTEGER NOT NULL DEFAULT 20,
    "endOnVoiceLeave" BOOLEAN NOT NULL DEFAULT true,
    "modes" JSONB NOT NULL DEFAULT '["Ranked","Quick Match","Unranked","Arcade","Customs"]',
    "matchmakingButton" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" TIMESTAMP(3),
    CONSTRAINT "PlayingNowConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayingNowConfig_guildId_key" ON "PlayingNowConfig"("guildId");

CREATE TABLE "PlayingNowPost" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "need" INTEGER NOT NULL,
    "joined" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "voiceId" TEXT,
    "messageId" TEXT,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "seenVoice" BOOLEAN NOT NULL DEFAULT false,
    "awaySince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayingNowPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlayingNowPost_guildId_endedAt_idx" ON "PlayingNowPost"("guildId", "endedAt");
CREATE INDEX "PlayingNowPost_endedAt_endsAt_idx" ON "PlayingNowPost"("endedAt", "endsAt");
