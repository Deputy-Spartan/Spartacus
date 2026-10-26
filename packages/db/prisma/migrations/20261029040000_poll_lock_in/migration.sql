-- AlterTable
ALTER TABLE "Poll" ADD COLUMN "allowLockIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PollSubmission" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PollSubmission_pollId_userId_key" ON "PollSubmission"("pollId", "userId");

-- AddForeignKey
ALTER TABLE "PollSubmission" ADD CONSTRAINT "PollSubmission_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
