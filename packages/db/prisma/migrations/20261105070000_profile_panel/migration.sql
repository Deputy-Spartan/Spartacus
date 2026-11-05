ALTER TABLE "ProfileCardSettings" ADD COLUMN "panelChannelId" TEXT;
ALTER TABLE "ProfileCardSettings" ADD COLUMN "panelMessageId" TEXT;
ALTER TABLE "ProfileCardSettings" ADD COLUMN "panelTitle" TEXT;
ALTER TABLE "ProfileCardSettings" ADD COLUMN "panelText" TEXT;
ALTER TABLE "ProfileCardSettings" ADD COLUMN "panelColor" TEXT;
ALTER TABLE "ProfileCardSettings" ADD COLUMN "panelPublic" BOOLEAN NOT NULL DEFAULT false;
