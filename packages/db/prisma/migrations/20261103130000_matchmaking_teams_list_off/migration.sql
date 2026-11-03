-- The Teams list part starts off now. Boards still on the old default switch
-- it off too; anyone who changed their layout keeps it.
ALTER TABLE "MatchmakingConfig" ALTER COLUMN "panelParts" SET DEFAULT '["SOLO","TEAM","PICKUP","TOOLS"]';
UPDATE "MatchmakingConfig" SET "panelParts" = '["SOLO","TEAM","PICKUP","TOOLS"]' WHERE "panelParts" = '["SOLO","TEAM","PICKUP","TEAMS","TOOLS"]'::jsonb;
