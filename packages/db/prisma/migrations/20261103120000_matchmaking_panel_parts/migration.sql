-- AlterTable
ALTER TABLE "MatchmakingConfig" ADD COLUMN     "panelMessages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "panelParts" JSONB NOT NULL DEFAULT '["SOLO","TEAM","PICKUP","TEAMS","TOOLS"]';
