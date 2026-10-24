-- AlterTable
ALTER TABLE "WelcomeConfig" ALTER COLUMN "embedEnabled" SET DEFAULT false;

-- CreateTable
CREATE TABLE "WelcomeGreeting" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "buttonLabel" TEXT NOT NULL DEFAULT '👋 Wave to say hi!',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WelcomeGreeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WelcomeGreeting_guildId_idx" ON "WelcomeGreeting"("guildId");

-- AddForeignKey
ALTER TABLE "WelcomeGreeting" ADD CONSTRAINT "WelcomeGreeting_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
