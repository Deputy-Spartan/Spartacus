-- DropForeignKey
ALTER TABLE "MatchResult" DROP CONSTRAINT "MatchResult_setupId_fkey";

-- AlterTable
ALTER TABLE "MatchSetup" ADD COLUMN     "joinMode" TEXT NOT NULL DEFAULT 'ASSIGN',
ADD COLUMN     "rosterView" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "startMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "teamNames" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "useTimers" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "voteSeconds" SET DEFAULT 0,
ALTER COLUMN "checkIn" SET DEFAULT false,
ALTER COLUMN "rewardsEnabled" SET DEFAULT false;

-- AlterTable
ALTER TABLE "MatchResult" ADD COLUMN     "game" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "loserTeam" TEXT,
ADD COLUMN     "winnerTeam" TEXT,
ALTER COLUMN "setupId" DROP NOT NULL,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MatchmakingConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "boardChannelId" TEXT,
    "boardMessageId" TEXT,
    "boardGame" TEXT NOT NULL DEFAULT 'ALL',
    "boardSince" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "messageId" TEXT,
    "voiceCategoryId" TEXT,
    "createVoice" BOOLEAN NOT NULL DEFAULT true,
    "ranked" BOOLEAN NOT NULL DEFAULT true,
    "games" JSONB NOT NULL DEFAULT '[]',
    "challengeMinutes" INTEGER NOT NULL DEFAULT 5,
    "queueMinutes" INTEGER NOT NULL DEFAULT 60,
    "reportHours" INTEGER NOT NULL DEFAULT 3,
    "staffRoleId" TEXT,
    "nextRoomNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MatchmakingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchTeam" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "players" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchQueue" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchChallenge" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "fromTeam" TEXT,
    "toTeam" TEXT,
    "messageId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRoom" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "aName" TEXT NOT NULL,
    "bName" TEXT NOT NULL,
    "aPlayers" JSONB NOT NULL,
    "bPlayers" JSONB NOT NULL,
    "aCaptain" TEXT NOT NULL,
    "bCaptain" TEXT NOT NULL,
    "map" TEXT,
    "threadId" TEXT,
    "voiceIds" JSONB NOT NULL DEFAULT '[]',
    "messageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "reportSide" TEXT,
    "reportHigh" INTEGER,
    "reportLow" INTEGER,
    "reportedBy" TEXT,
    "disputes" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchmakingConfig_guildId_key" ON "MatchmakingConfig"("guildId");

-- CreateIndex
CREATE INDEX "MatchTeam_guildId_captainId_idx" ON "MatchTeam"("guildId", "captainId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchTeam_guildId_game_name_key" ON "MatchTeam"("guildId", "game", "name");

-- CreateIndex
CREATE INDEX "MatchQueue_joinedAt_idx" ON "MatchQueue"("joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchQueue_guildId_game_kind_userId_key" ON "MatchQueue"("guildId", "game", "kind", "userId");

-- CreateIndex
CREATE INDEX "MatchChallenge_expiresAt_idx" ON "MatchChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "MatchRoom_guildId_status_idx" ON "MatchRoom"("guildId", "status");

-- CreateIndex
CREATE INDEX "MatchRoom_status_expiresAt_idx" ON "MatchRoom"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MatchResult_guildId_createdAt_idx" ON "MatchResult"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "MatchSetup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchmakingConfig" ADD CONSTRAINT "MatchmakingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTeam" ADD CONSTRAINT "MatchTeam_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRoom" ADD CONSTRAINT "MatchRoom_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Setups saved before this keep working the way they already did.
UPDATE "MatchSetup" SET "useTimers" = true, "startMode" = 'FULL';

-- Existing results keep counting on the leaderboard under their game.
UPDATE "MatchResult" r SET "game" = s."game" FROM "MatchSetup" s WHERE r."setupId" = s."id";
