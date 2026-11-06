-- Owner Only → Front Page: the public status page link (e.g. an UptimeRobot status page).
ALTER TABLE "BotConfig" ADD COLUMN "statusPageUrl" TEXT;
