-- AI Chat: model pick and web search.
ALTER TABLE "AiConfig" ADD COLUMN "chatModel" TEXT NOT NULL DEFAULT 'smart';
ALTER TABLE "AiConfig" ADD COLUMN "chatWebSearch" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiConfig" ADD COLUMN "chatMaxSearches" INTEGER NOT NULL DEFAULT 3;
