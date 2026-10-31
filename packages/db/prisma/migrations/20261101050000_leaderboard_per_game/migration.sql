-- Each game can now have its own leaderboard post.
ALTER TABLE "MatchmakingConfig" ADD COLUMN "boardGames" JSONB NOT NULL DEFAULT '["ALL"]',
ADD COLUMN "boardMessages" JSONB NOT NULL DEFAULT '{}';

-- Carry over the game and message picked before this.
UPDATE "MatchmakingConfig"
SET "boardGames" = jsonb_build_array("boardGame"),
    "boardMessages" = CASE WHEN "boardMessageId" IS NULL THEN '{}'::jsonb ELSE jsonb_build_object("boardGame", "boardMessageId") END;

ALTER TABLE "MatchmakingConfig" DROP COLUMN "boardGame",
DROP COLUMN "boardMessageId";
