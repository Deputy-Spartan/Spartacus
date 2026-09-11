-- CreateTable
CREATE TABLE "EmbedComponentAction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbedComponentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmbedComponentAction_guildId_idx" ON "EmbedComponentAction"("guildId");

-- AddForeignKey
ALTER TABLE "EmbedComponentAction" ADD CONSTRAINT "EmbedComponentAction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
