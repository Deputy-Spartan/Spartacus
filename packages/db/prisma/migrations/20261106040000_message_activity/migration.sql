-- Message counts per hour and per channel (counts only, never message text),
-- for the Overview's Busiest hours and Top channels charts. Kept 35 days.
CREATE TABLE "MessageActivity" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MessageActivity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageActivity_guildId_day_hour_channelId_key" ON "MessageActivity"("guildId", "day", "hour", "channelId");
CREATE INDEX "MessageActivity_guildId_day_idx" ON "MessageActivity"("guildId", "day");
