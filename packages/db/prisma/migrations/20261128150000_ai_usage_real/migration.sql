-- AI Usage: real spending from Anthropic's cost report.
ALTER TABLE "AiUsageSettings" ADD COLUMN "realMonth" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AiUsageSettings" ADD COLUMN "realMicros" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageSettings" ADD COLUMN "realAt" TIMESTAMP(3);
