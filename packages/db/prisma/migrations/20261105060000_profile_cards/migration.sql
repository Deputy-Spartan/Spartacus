-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'PROFILE_CARDS';

CREATE TABLE "ProfileCard" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "bio" TEXT,
    "theme" TEXT,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "games" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unlockedThemes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfileCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfileCard_guildId_userId_key" ON "ProfileCard"("guildId", "userId");

CREATE TABLE "ProfileCardSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "stats" TEXT[] DEFAULT ARRAY['rank', 'voice', 'matches', 'coins', 'invites', 'achievements']::TEXT[],
    "allowBios" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProfileCardSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfileCardSettings_guildId_key" ON "ProfileCardSettings"("guildId");
