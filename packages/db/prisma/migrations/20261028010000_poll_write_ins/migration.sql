-- AlterTable
ALTER TABLE "Poll" ADD COLUMN "allowWriteIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PollWriteIn" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollWriteIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollWriteIn_pollId_idx" ON "PollWriteIn"("pollId");

-- AddForeignKey
ALTER TABLE "PollWriteIn" ADD CONSTRAINT "PollWriteIn_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PollWriteInPending" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollWriteInPending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PollWriteInPending_userId_key" ON "PollWriteInPending"("userId");
