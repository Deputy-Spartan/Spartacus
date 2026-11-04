-- AlterTable
ALTER TABLE "TempChannelLobby" ADD COLUMN     "panelChannelId" TEXT,
ADD COLUMN     "panelColor" INTEGER NOT NULL DEFAULT 5793266,
ADD COLUMN     "panelMessageId" TEXT,
ADD COLUMN     "panelText" TEXT NOT NULL DEFAULT E'Pick the game you''re playing below and Spartacus makes a voice channel for your squad.\n\nOr join {lobby} to make one straight away.',
ADD COLUMN     "panelTitle" TEXT NOT NULL DEFAULT '🔊 Create a Squad';
