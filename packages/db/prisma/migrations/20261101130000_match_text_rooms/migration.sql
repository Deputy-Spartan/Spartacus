-- AlterTable
ALTER TABLE "MatchmakingConfig" ADD COLUMN     "roomCloseSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "textRoomName" TEXT NOT NULL DEFAULT 'match-{number}-{a}-vs-{b}',
ADD COLUMN     "textRoomView" TEXT NOT NULL DEFAULT 'PLAYERS',
ADD COLUMN     "textRooms" BOOLEAN NOT NULL DEFAULT true;
