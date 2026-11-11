-- AI Chat answers every message in its channel unless this is on.
ALTER TABLE "AiConfig" ADD COLUMN "chatRequireMention" BOOLEAN NOT NULL DEFAULT false;
