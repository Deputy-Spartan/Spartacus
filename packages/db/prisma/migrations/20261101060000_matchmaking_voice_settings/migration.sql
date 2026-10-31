-- AlterTable
ALTER TABLE "MatchmakingConfig" ADD COLUMN     "activityChannelId" TEXT,
ADD COLUMN     "duelVoiceName" TEXT NOT NULL DEFAULT '{a} vs {b}',
ADD COLUMN     "lobbyVoiceId" TEXT,
ADD COLUMN     "requireLobby" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teamVoiceName" TEXT NOT NULL DEFAULT '{team}',
ADD COLUMN     "voiceExtra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voiceLimit" TEXT NOT NULL DEFAULT 'TEAM',
ADD COLUMN     "voiceNumberPad" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "voicePlacement" TEXT NOT NULL DEFAULT 'BELOW_LOBBY',
ADD COLUMN     "voicePrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceReturn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "voiceSource" TEXT NOT NULL DEFAULT 'LOBBY';

