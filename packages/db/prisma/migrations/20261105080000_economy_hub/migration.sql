-- New XP curve: 100 XP per level. Recalculate everyone's level from their XP total.
UPDATE "MemberXp" SET "level" = "xp" / 100;

CREATE TABLE "EconomyPlus" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "levelColors" BOOLEAN NOT NULL DEFAULT true,
    "levelUpCard" BOOLEAN NOT NULL DEFAULT true,
    "levelUpCoins" INTEGER NOT NULL DEFAULT 50,
    "keepTopLevelRole" BOOLEAN NOT NULL DEFAULT true,
    "shopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shopLogChannelId" TEXT,
    "shopPanelChannelId" TEXT,
    "shopPanelMessageId" TEXT,
    "shopPanelTitle" TEXT,
    "shopPanelText" TEXT,
    "cratesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "crateEveryLevels" INTEGER NOT NULL DEFAULT 5,
    "crateOnStreak" BOOLEAN NOT NULL DEFAULT true,
    "crateChannelId" TEXT,
    "voiceXpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voiceXpPerMin" INTEGER NOT NULL DEFAULT 5,
    "voiceCoinsPer10" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "weekendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "weekendMult" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "happyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "happyHour" INTEGER NOT NULL DEFAULT 20,
    "happyMult" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "eventChannelId" TEXT,
    "eventState" TEXT,
    "prestigeBonusPct" INTEGER NOT NULL DEFAULT 10,
    "champsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "champsChannelId" TEXT,
    "champsRoleId" TEXT,
    "champsCategories" TEXT[] DEFAULT ARRAY['xp', 'coins', 'voice', 'streak']::TEXT[],
    "lastChampsWeek" TEXT,
    CONSTRAINT "EconomyPlus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EconomyPlus_guildId_key" ON "EconomyPlus"("guildId");

CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🛒',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "roleId" TEXT,
    "durationDays" INTEGER,
    "boostMult" DOUBLE PRECISION,
    "boostMinutes" INTEGER,
    "crateRarity" TEXT,
    "stock" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopItem_guildId_idx" ON "ShopItem"("guildId");

CREATE TABLE "ShopPurchase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopPurchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopPurchase_guildId_createdAt_idx" ON "ShopPurchase"("guildId", "createdAt");

CREATE TABLE "EconomyInventory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "common" INTEGER NOT NULL DEFAULT 0,
    "rare" INTEGER NOT NULL DEFAULT 0,
    "epic" INTEGER NOT NULL DEFAULT 0,
    "legendary" INTEGER NOT NULL DEFAULT 0,
    "streakFreezes" INTEGER NOT NULL DEFAULT 0,
    "boostUntil" TIMESTAMP(3),
    "boostMult" DOUBLE PRECISION NOT NULL DEFAULT 1,
    CONSTRAINT "EconomyInventory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EconomyInventory_guildId_userId_key" ON "EconomyInventory"("guildId", "userId");

CREATE TABLE "EconomyTimedRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EconomyTimedRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EconomyTimedRole_guildId_userId_roleId_key" ON "EconomyTimedRole"("guildId", "userId", "roleId");
CREATE INDEX "EconomyTimedRole_expiresAt_idx" ON "EconomyTimedRole"("expiresAt");

CREATE TABLE "WeeklyStat" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "voiceMin" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WeeklyStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyStat_guildId_userId_week_key" ON "WeeklyStat"("guildId", "userId", "week");
CREATE INDEX "WeeklyStat_guildId_week_idx" ON "WeeklyStat"("guildId", "week");
