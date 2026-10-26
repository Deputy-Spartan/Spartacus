-- DropForeignKey
ALTER TABLE "PollVote" DROP CONSTRAINT "PollVote_pollId_fkey";

-- DropForeignKey
ALTER TABLE "PollWriteIn" DROP CONSTRAINT "PollWriteIn_pollId_fkey";

-- AddForeignKey
-- Deleting a poll should take its votes and write-ins with it instead of
-- being blocked by them — previously ON DELETE RESTRICT meant removing any
-- poll that had at least one vote or write-in failed outright.
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollWriteIn" ADD CONSTRAINT "PollWriteIn_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
