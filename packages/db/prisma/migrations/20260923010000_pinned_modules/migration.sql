CREATE TABLE "PinnedModule" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PinnedModule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PinnedModule_guildId_userId_href_key" ON "PinnedModule"("guildId", "userId", "href");
CREATE INDEX "PinnedModule_guildId_userId_idx" ON "PinnedModule"("guildId", "userId");
ALTER TABLE "PinnedModule" ADD CONSTRAINT "PinnedModule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
