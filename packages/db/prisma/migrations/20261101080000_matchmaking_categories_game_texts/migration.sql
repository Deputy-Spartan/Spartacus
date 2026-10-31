-- 1v1 and team voice channels can each have their own category.
ALTER TABLE "MatchmakingConfig" ADD COLUMN "duelCategoryId" TEXT,
ADD COLUMN "teamCategoryId" TEXT,
ADD COLUMN "gameTexts" JSONB NOT NULL DEFAULT '{}';

-- Carry over the single category picked before this.
UPDATE "MatchmakingConfig" SET "duelCategoryId" = "voiceCategoryId", "teamCategoryId" = "voiceCategoryId";

ALTER TABLE "MatchmakingConfig" DROP COLUMN "voiceCategoryId";
