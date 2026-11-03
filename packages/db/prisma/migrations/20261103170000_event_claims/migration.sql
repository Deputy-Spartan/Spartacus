-- CreateTable
CREATE TABLE "EventClaim" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventClaim_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "EventClaim_createdAt_idx" ON "EventClaim"("createdAt");
