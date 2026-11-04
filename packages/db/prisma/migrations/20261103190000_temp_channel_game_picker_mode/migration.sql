-- AlterTable
ALTER TABLE "TempChannelLobby" ADD COLUMN     "gamePicker" BOOLEAN NOT NULL DEFAULT false;

-- Lobbies that already list games keep their menu
UPDATE "TempChannelLobby" SET "gamePicker" = true WHERE jsonb_array_length("gameChoices") > 0;
