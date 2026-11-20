-- An embed a module built for itself ("Build here"), kept out of the library.
ALTER TABLE "EmbedCreatorPreset" ADD COLUMN "ownerKey" TEXT;

-- Messages that get their own embed for the first time.
ALTER TABLE "WelcomeConfig" ADD COLUMN "goodbyeSavedEmbedId" TEXT;

CREATE UNIQUE INDEX "EmbedCreatorPreset_guildId_ownerKey_key" ON "EmbedCreatorPreset"("guildId", "ownerKey");
