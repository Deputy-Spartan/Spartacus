-- CreateTable
CREATE TABLE "SupportSettings" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "introMessage" TEXT,
  "noFlowsMessage" TEXT,
  CONSTRAINT "SupportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportSettings_guildId_key" ON "SupportSettings"("guildId");

-- AddForeignKey
ALTER TABLE "SupportSettings" ADD CONSTRAINT "SupportSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
