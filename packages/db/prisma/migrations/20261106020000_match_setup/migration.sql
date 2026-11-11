-- /match setup: the player role gate, the alerts role, and the tournament channel.
ALTER TABLE "MatchmakingConfig" ADD COLUMN "playerRoleId" TEXT;
ALTER TABLE "MatchmakingConfig" ADD COLUMN "alertsRoleId" TEXT;
ALTER TABLE "MatchmakingConfig" ADD COLUMN "tournamentChannelId" TEXT;
ALTER TABLE "MatchmakingConfig" ADD COLUMN "setupCategoryId" TEXT;
