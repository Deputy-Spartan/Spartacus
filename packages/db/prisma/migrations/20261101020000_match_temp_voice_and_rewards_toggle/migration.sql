-- AlterTable
ALTER TABLE "MatchSetup" DROP COLUMN "team1VoiceId",
DROP COLUMN "team2VoiceId",
ADD COLUMN     "rewardsEnabled" BOOLEAN NOT NULL DEFAULT true;

