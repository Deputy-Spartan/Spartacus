-- AlterTable
ALTER TABLE "TempChannelLobby" ADD COLUMN     "controlsChannelId" TEXT,
ADD COLUMN     "controlsWhere" TEXT NOT NULL DEFAULT 'VOICE';

-- AlterTable
ALTER TABLE "TempChannelInstance" ADD COLUMN     "controlsThreadId" TEXT;
