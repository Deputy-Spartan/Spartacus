-- Going Live can use a saved embed instead of its own designed alert.
ALTER TABLE "StreamAlertSettings" ADD COLUMN IF NOT EXISTS "savedEmbedId" TEXT;
