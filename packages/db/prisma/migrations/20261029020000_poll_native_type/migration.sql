-- CreateEnum
CREATE TYPE "PollType" AS ENUM ('CUSTOM', 'NATIVE');

-- AlterTable
ALTER TABLE "Poll"
  ADD COLUMN "pollType" "PollType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "allowMultiselect" BOOLEAN NOT NULL DEFAULT false;
