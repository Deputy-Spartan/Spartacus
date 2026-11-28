-- AI Usage (owner only): a log of every AI Chat question, daily totals, and budget settings.
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "question" TEXT,
    "answer" TEXT,
    "sources" JSONB,
    "model" TEXT NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "fail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
CREATE INDEX "AiUsageLog_guildId_createdAt_idx" ON "AiUsageLog"("guildId", "createdAt");

CREATE TABLE "AiUsageDay" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "flagged" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "searchMicros" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AiUsageDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiUsageDay_day_guildId_kind_key" ON "AiUsageDay"("day", "guildId", "kind");
CREATE INDEX "AiUsageDay_day_idx" ON "AiUsageDay"("day");

CREATE TABLE "AiUsageSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "budgetCents" INTEGER NOT NULL DEFAULT 1000,
    "alert75" BOOLEAN NOT NULL DEFAULT true,
    "alert90" BOOLEAN NOT NULL DEFAULT true,
    "onEmpty" TEXT NOT NULL DEFAULT 'fast',
    "keepDays" INTEGER NOT NULL DEFAULT 30,
    "alertMonth" TEXT NOT NULL DEFAULT '',
    "sent75" BOOLEAN NOT NULL DEFAULT false,
    "sent90" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AiUsageSettings_pkey" PRIMARY KEY ("id")
);
