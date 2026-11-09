-- Going Live: per-streamer alert looks, and more control over the alert and the ended summary.
ALTER TABLE "StreamSubscription" ADD COLUMN "alertOverrides" JSONB;
ALTER TABLE "StreamAlertSettings" ADD COLUMN "showGame" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StreamAlertSettings" ADD COLUMN "showViewers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StreamAlertSettings" ADD COLUMN "endedTitle" TEXT;
ALTER TABLE "StreamAlertSettings" ADD COLUMN "endedDescription" TEXT;
ALTER TABLE "StreamAlertSettings" ADD COLUMN "endedColor" TEXT;
