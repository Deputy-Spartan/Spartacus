CREATE TABLE "ChangelogEntry" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChangelogSeen" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangelogSeen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChangelogSeen_userId_key" ON "ChangelogSeen"("userId");
