ALTER TABLE "VerificationConfig" ADD COLUMN "defaultEmbedTitle" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "defaultEmbedDescription" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "embedColor" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "buttonLabel" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "buttonEmoji" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'BUTTON';
ALTER TABLE "VerificationConfig" ADD COLUMN "requireAvatar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerificationConfig" ADD COLUMN "accountTooNewMessage" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "noAvatarMessage" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "maxFailures" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "VerificationConfig" ADD COLUMN "failAction" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "VerificationConfig" ADD COLUMN "unverifiedRoleId" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "giveUnverifiedOnJoin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerificationConfig" ADD COLUMN "logChannelId" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "dmConfirmEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerificationConfig" ADD COLUMN "dmConfirmMessage" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerificationConfig" ADD COLUMN "reminderDelayHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "VerificationConfig" ADD COLUMN "reminderMessage" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "kickEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerificationConfig" ADD COLUMN "kickAfterHours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "VerificationConfig" ADD COLUMN "kickMessage" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "verifiedReply" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "alreadyVerifiedReply" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "noRoleReply" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "captchaPrompt" TEXT;
ALTER TABLE "VerificationConfig" ADD COLUMN "captchaWrongReply" TEXT;

CREATE TABLE "VerificationPendingMember" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VerificationPendingMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VerificationPendingMember_guildId_userId_key" ON "VerificationPendingMember"("guildId", "userId");

CREATE TABLE "VerificationLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VerificationLog_guildId_createdAt_idx" ON "VerificationLog"("guildId", "createdAt");
