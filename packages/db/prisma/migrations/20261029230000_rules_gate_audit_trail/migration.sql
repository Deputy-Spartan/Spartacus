ALTER TABLE "RulesGateSettings" DROP COLUMN "agreedCount";

CREATE TABLE "RulesGateAgreement" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "roleId" TEXT,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulesGateAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RulesGateAgreement_guildId_agreedAt_idx" ON "RulesGateAgreement"("guildId", "agreedAt");

ALTER TABLE "RulesGateAgreement" ADD CONSTRAINT "RulesGateAgreement_settingsId_fkey"
    FOREIGN KEY ("settingsId") REFERENCES "RulesGateSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
