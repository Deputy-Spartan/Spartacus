ALTER TABLE "LevelingSettings" ADD COLUMN "xpBoost" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "LevelingSettings" ADD COLUMN "xpBoostEndsAt" TIMESTAMP(3);

CREATE TABLE "StreamDeckKey" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "StreamDeckKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamDeckKey_hash_key" ON "StreamDeckKey"("hash");
CREATE INDEX "StreamDeckKey_guildId_idx" ON "StreamDeckKey"("guildId");

CREATE TABLE "StreamDeckLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StreamDeckLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StreamDeckLog_guildId_createdAt_idx" ON "StreamDeckLog"("guildId", "createdAt");

CREATE TABLE "StreamDeckState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    CONSTRAINT "StreamDeckState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StreamDeckState_guildId_key_key" ON "StreamDeckState"("guildId", "key");
