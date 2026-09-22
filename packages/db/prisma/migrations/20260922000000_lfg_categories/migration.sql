CREATE TABLE "LfgCategory" (
  "id" TEXT NOT NULL,
  "lfgCommandId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "roleId" TEXT,
  "message" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LfgCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LfgCategory_lfgCommandId_name_key" ON "LfgCategory"("lfgCommandId", "name");

ALTER TABLE "LfgCategory" ADD CONSTRAINT "LfgCategory_lfgCommandId_fkey" FOREIGN KEY ("lfgCommandId") REFERENCES "LfgCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
