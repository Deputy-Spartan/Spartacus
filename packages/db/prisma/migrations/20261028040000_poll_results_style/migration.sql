-- CreateEnum
CREATE TYPE "PollResultsStyle" AS ENUM ('BARS', 'SIMPLE');

-- CreateEnum
CREATE TYPE "PollBarStyle" AS ENUM ('SQUARE', 'BLOCK', 'CIRCLE', 'CLASSIC');

-- AlterTable
ALTER TABLE "Poll"
  ADD COLUMN "resultsStyle" "PollResultsStyle" NOT NULL DEFAULT 'BARS',
  ADD COLUMN "barStyle" "PollBarStyle" NOT NULL DEFAULT 'SQUARE';
