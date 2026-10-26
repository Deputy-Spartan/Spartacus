-- CreateEnum
CREATE TYPE "PollDurationMode" AS ENUM ('TIMER', 'MANUAL');

-- AlterTable
ALTER TABLE "Poll"
  ADD COLUMN "emojis" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "color" TEXT DEFAULT '#00E5FF',
  ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "durationMode" "PollDurationMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Poll_messageId_idx" ON "Poll"("messageId");

-- AlterTable: PollVote.option (Int, indexed into the old fixed options list)
-- is replaced by emoji (the actual reaction clicked) — the whole voting
-- mechanic moved from buttons to reactions, so old rows don't carry forward.
ALTER TABLE "PollVote" DROP COLUMN "option";
ALTER TABLE "PollVote" ADD COLUMN "emoji" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PollVote" ALTER COLUMN "emoji" DROP DEFAULT;
