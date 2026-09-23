CREATE TABLE "LevelingSettings" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT,
  "levelUpMessage" TEXT NOT NULL DEFAULT '🎉 {user} just reached **Level {level}**!',
  CONSTRAINT "LevelingSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LevelingSettings_guildId_key" ON "LevelingSettings"("guildId");
ALTER TABLE "LevelingSettings" ADD CONSTRAINT "LevelingSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AchievementSettings" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT,
  CONSTRAINT "AchievementSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AchievementSettings_guildId_key" ON "AchievementSettings"("guildId");
ALTER TABLE "AchievementSettings" ADD CONSTRAINT "AchievementSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomAchievement" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '🏆',
  "triggerType" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomAchievement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomAchievement_guildId_triggerType_idx" ON "CustomAchievement"("guildId", "triggerType");
ALTER TABLE "CustomAchievement" ADD CONSTRAINT "CustomAchievement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
