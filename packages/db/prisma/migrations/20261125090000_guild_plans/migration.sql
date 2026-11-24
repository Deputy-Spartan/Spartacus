-- Paid plans from the Outpost Gaming store, placed on a server.
CREATE TABLE "GuildPlan" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tiers" TEXT[],
    "ownerDiscordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "periodEnd" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuildPlan_entitlementId_key" ON "GuildPlan"("entitlementId");
CREATE INDEX "GuildPlan_guildId_idx" ON "GuildPlan"("guildId");
CREATE INDEX "GuildPlan_ownerDiscordId_idx" ON "GuildPlan"("ownerDiscordId");