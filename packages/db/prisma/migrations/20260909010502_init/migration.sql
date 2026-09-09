-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('MODERATION', 'WELCOME', 'LEVELING', 'STREAM_ALERTS', 'CUSTOM_COMMANDS', 'EVENTS', 'LOGGING', 'ANTI_RAID', 'REACTION_ROLES', 'JOIN_ROLES', 'STICKY_MESSAGES', 'STARBOARD', 'TEMP_CHANNELS', 'TICKETS', 'GIVEAWAYS', 'VERIFICATION', 'QUARANTINE', 'ANTI_NUKE', 'HONEYPOT', 'ROLE_PERSISTENCE', 'SCHEDULED_MESSAGES', 'POLLS', 'SUGGESTIONS', 'ECONOMY', 'COUNTING_GAME', 'TRIVIA', 'CASINO', 'INVITE_TRACKING', 'MODMAIL', 'PLAYER_REPORTS', 'PERM_WATCH');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'REMINDED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignupRole" AS ENUM ('TANK', 'DPS', 'HEALER', 'ATTENDING', 'ABSENT', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLAIMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CaseAction" AS ENUM ('WARN', 'MUTE', 'KICK', 'BAN', 'UNBAN', 'UNMUTE');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "XpBlacklistType" AS ENUM ('CHANNEL', 'ROLE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleToggle" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,

    CONSTRAINT "ModuleToggle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "welcomeText" TEXT,
    "goodbyeText" TEXT,
    "embedColor" TEXT DEFAULT '#00E5FF',

    CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomCommand" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamSubscription" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "announceChannelId" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "StreamSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberXp" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberXp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdById" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSignup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SignupRole" NOT NULL,
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "signedUpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoggingConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "logChannelId" TEXT,
    "logEdits" BOOLEAN NOT NULL DEFAULT true,
    "logDeletes" BOOLEAN NOT NULL DEFAULT true,
    "logJoinsLeaves" BOOLEAN NOT NULL DEFAULT true,
    "logVoice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LoggingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiRaidConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "alertChannelId" TEXT,
    "joinRateLimit" INTEGER NOT NULL DEFAULT 10,
    "joinRateWindowSec" INTEGER NOT NULL DEFAULT 30,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 3,
    "autoLockdown" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AntiRaidConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "ReactionRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "JoinRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickyMessage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "lastMessageId" TEXT,

    CONSTRAINT "StickyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarboardConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "threshold" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "StarboardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarredMessage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "originalMessageId" TEXT NOT NULL,
    "starboardMessageId" TEXT,
    "starCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StarredMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempChannelLobby" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lobbyChannelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "nameFormat" TEXT NOT NULL DEFAULT 'Channel',
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "bitrate" INTEGER NOT NULL DEFAULT 64000,
    "deleteAfterEmptySec" INTEGER NOT NULL DEFAULT 0,
    "pairTextChannel" BOOLEAN NOT NULL DEFAULT false,
    "hideTextFromNonMembers" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TempChannelLobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempChannelInstance" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "textChannelId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempChannelInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Open a Ticket',
    "supportRoleId" TEXT,
    "messageId" TEXT,

    CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedById" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "winnerCount" INTEGER NOT NULL DEFAULT 1,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "ended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "CaseAction" NOT NULL,
    "reason" TEXT,
    "moderatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "verifiedRoleId" TEXT,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VerificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarantineRecord" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "quarantinedBy" TEXT NOT NULL,
    "previousRoles" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarantineRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiNukeConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "alertChannelId" TEXT,
    "maxBansPerMinute" INTEGER NOT NULL DEFAULT 3,
    "maxChannelDeletesPerMinute" INTEGER NOT NULL DEFAULT 3,
    "stripRolesOnTrigger" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AntiNukeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoneypotConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,

    CONSTRAINT "HoneypotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleSnapshot" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleIds" TEXT[],
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "option" INTEGER NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "currencyName" TEXT NOT NULL DEFAULT 'Coins',
    "currencyIcon" TEXT NOT NULL DEFAULT '🪙',
    "messageEarnMin" INTEGER NOT NULL DEFAULT 2,
    "messageEarnMax" INTEGER NOT NULL DEFAULT 6,
    "dailyAmount" INTEGER NOT NULL DEFAULT 200,
    "maxBet" INTEGER NOT NULL DEFAULT 5000,

    CONSTRAINT "EconomyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyBalance" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lastDailyClaim" TIMESTAMP(3),

    CONSTRAINT "EconomyBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "LevelRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpBlacklistEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "XpBlacklistType" NOT NULL,

    CONSTRAINT "XpBlacklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountingGameConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "lastUserId" TEXT,
    "resetOnMistake" BOOLEAN NOT NULL DEFAULT true,
    "highScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CountingGameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteStat" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InviteStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModmailThread" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "subject" TEXT,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerPartnership" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "partnerInvite" TEXT,
    "type" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerPartnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerReport" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermWatchConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "alertChannelId" TEXT,

    CONSTRAINT "PermWatchConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModuleToggle_guildId_idx" ON "ModuleToggle"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleToggle_guildId_key_key" ON "ModuleToggle"("guildId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeConfig_guildId_key" ON "WelcomeConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomCommand_guildId_trigger_key" ON "CustomCommand"("guildId", "trigger");

-- CreateIndex
CREATE INDEX "StreamSubscription_guildId_idx" ON "StreamSubscription"("guildId");

-- CreateIndex
CREATE INDEX "MemberXp_guildId_xp_idx" ON "MemberXp"("guildId", "xp");

-- CreateIndex
CREATE UNIQUE INDEX "MemberXp_guildId_userId_key" ON "MemberXp"("guildId", "userId");

-- CreateIndex
CREATE INDEX "Event_guildId_startTime_idx" ON "Event"("guildId", "startTime");

-- CreateIndex
CREATE INDEX "EventSignup_eventId_idx" ON "EventSignup"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSignup_eventId_userId_key" ON "EventSignup"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LoggingConfig_guildId_key" ON "LoggingConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AntiRaidConfig_guildId_key" ON "AntiRaidConfig"("guildId");

-- CreateIndex
CREATE INDEX "ReactionRole_guildId_idx" ON "ReactionRole"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRole_messageId_emoji_key" ON "ReactionRole"("messageId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "JoinRole_guildId_roleId_key" ON "JoinRole"("guildId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "StickyMessage_channelId_key" ON "StickyMessage"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "StarboardConfig_guildId_key" ON "StarboardConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "StarredMessage_guildId_originalMessageId_key" ON "StarredMessage"("guildId", "originalMessageId");

-- CreateIndex
CREATE INDEX "TempChannelLobby_guildId_idx" ON "TempChannelLobby"("guildId");

-- CreateIndex
CREATE INDEX "TempChannelInstance_guildId_idx" ON "TempChannelInstance"("guildId");

-- CreateIndex
CREATE INDEX "TicketPanel_guildId_idx" ON "TicketPanel"("guildId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");

-- CreateIndex
CREATE INDEX "Giveaway_guildId_endsAt_idx" ON "Giveaway"("guildId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_userId_key" ON "GiveawayEntry"("giveawayId", "userId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_userId_idx" ON "ModerationCase"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_guildId_caseNumber_key" ON "ModerationCase"("guildId", "caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationConfig_guildId_key" ON "VerificationConfig"("guildId");

-- CreateIndex
CREATE INDEX "QuarantineRecord_guildId_active_idx" ON "QuarantineRecord"("guildId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AntiNukeConfig_guildId_key" ON "AntiNukeConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "HoneypotConfig_guildId_key" ON "HoneypotConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleSnapshot_guildId_userId_key" ON "RoleSnapshot"("guildId", "userId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_guildId_idx" ON "ScheduledMessage"("guildId");

-- CreateIndex
CREATE INDEX "Poll_guildId_idx" ON "Poll"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");

-- CreateIndex
CREATE INDEX "Suggestion_guildId_status_idx" ON "Suggestion"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EconomyConfig_guildId_key" ON "EconomyConfig"("guildId");

-- CreateIndex
CREATE INDEX "EconomyBalance_guildId_balance_idx" ON "EconomyBalance"("guildId", "balance");

-- CreateIndex
CREATE UNIQUE INDEX "EconomyBalance_guildId_userId_key" ON "EconomyBalance"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LevelRole_guildId_level_key" ON "LevelRole"("guildId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "XpBlacklistEntry_guildId_targetId_key" ON "XpBlacklistEntry"("guildId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CountingGameConfig_guildId_key" ON "CountingGameConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteStat_guildId_inviterId_key" ON "InviteStat"("guildId", "inviterId");

-- CreateIndex
CREATE INDEX "ModmailThread_guildId_open_idx" ON "ModmailThread"("guildId", "open");

-- CreateIndex
CREATE INDEX "PlayerReport_guildId_status_idx" ON "PlayerReport"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PermWatchConfig_guildId_key" ON "PermWatchConfig"("guildId");

-- AddForeignKey
ALTER TABLE "ModuleToggle" ADD CONSTRAINT "ModuleToggle_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeConfig" ADD CONSTRAINT "WelcomeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomCommand" ADD CONSTRAINT "CustomCommand_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSubscription" ADD CONSTRAINT "StreamSubscription_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberXp" ADD CONSTRAINT "MemberXp_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSignup" ADD CONSTRAINT "EventSignup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggingConfig" ADD CONSTRAINT "LoggingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntiRaidConfig" ADD CONSTRAINT "AntiRaidConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRole" ADD CONSTRAINT "ReactionRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRole" ADD CONSTRAINT "JoinRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickyMessage" ADD CONSTRAINT "StickyMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardConfig" ADD CONSTRAINT "StarboardConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarredMessage" ADD CONSTRAINT "StarredMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempChannelLobby" ADD CONSTRAINT "TempChannelLobby_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempChannelInstance" ADD CONSTRAINT "TempChannelInstance_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPanel" ADD CONSTRAINT "TicketPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationConfig" ADD CONSTRAINT "VerificationConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarantineRecord" ADD CONSTRAINT "QuarantineRecord_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntiNukeConfig" ADD CONSTRAINT "AntiNukeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoneypotConfig" ADD CONSTRAINT "HoneypotConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSnapshot" ADD CONSTRAINT "RoleSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyConfig" ADD CONSTRAINT "EconomyConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyBalance" ADD CONSTRAINT "EconomyBalance_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelRole" ADD CONSTRAINT "LevelRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpBlacklistEntry" ADD CONSTRAINT "XpBlacklistEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountingGameConfig" ADD CONSTRAINT "CountingGameConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteStat" ADD CONSTRAINT "InviteStat_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModmailThread" ADD CONSTRAINT "ModmailThread_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerPartnership" ADD CONSTRAINT "ServerPartnership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermWatchConfig" ADD CONSTRAINT "PermWatchConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
