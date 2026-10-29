ALTER TABLE "RulesGateSettings"
  ADD COLUMN "roleToRemoveId" TEXT,
  ADD COLUMN "logChannelId" TEXT,
  ADD COLUMN "dmConfirmEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dmConfirmMessage" TEXT,
  ADD COLUMN "agreedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "agreeReplyMessage" TEXT,
  ADD COLUMN "alreadyAgreedMessage" TEXT,
  ADD COLUMN "noRoleConfiguredMessage" TEXT;
