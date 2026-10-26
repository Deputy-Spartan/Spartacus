-- AlterTable
ALTER TABLE "Poll" ADD COLUMN "barColor" TEXT DEFAULT '#00E5FF';

-- DropTable
-- Write-ins now go through a button + modal instead of a DM collector, so
-- there's no longer a "pending DM reply" state to track.
DROP TABLE "PollWriteInPending";
