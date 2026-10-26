-- Drop native Discord poll support (reverted) and narrow bar styles to
-- just Classic/Solid. allowMultiselect is repurposed for CUSTOM polls.

-- Collapse any existing SQUARE/BLOCK/CIRCLE rows onto SOLID before the enum
-- itself loses those values.
UPDATE "Poll" SET "barStyle" = 'SOLID' WHERE "barStyle" NOT IN ('CLASSIC', 'SOLID');

CREATE TYPE "PollBarStyle_new" AS ENUM ('CLASSIC', 'SOLID');
ALTER TABLE "Poll" ALTER COLUMN "barStyle" DROP DEFAULT;
ALTER TABLE "Poll" ALTER COLUMN "barStyle" TYPE "PollBarStyle_new" USING ("barStyle"::text::"PollBarStyle_new");
ALTER TABLE "Poll" ALTER COLUMN "barStyle" SET DEFAULT 'SOLID';
DROP TYPE "PollBarStyle";
ALTER TYPE "PollBarStyle_new" RENAME TO "PollBarStyle";

ALTER TABLE "Poll" DROP COLUMN "pollType";
DROP TYPE "PollType";

-- One vote row per (poll, user, emoji) instead of one per (poll, user), so a
-- member can hold more than one reaction's vote when allowMultiselect is on.
ALTER TABLE "PollVote" DROP CONSTRAINT "PollVote_pollId_userId_key";
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_userId_emoji_key" UNIQUE ("pollId", "userId", "emoji");
CREATE INDEX "PollVote_pollId_userId_idx" ON "PollVote"("pollId", "userId");
