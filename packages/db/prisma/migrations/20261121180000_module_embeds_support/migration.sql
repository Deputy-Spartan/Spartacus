-- Support DM's opening message embed ("Build here" / "Use a saved embed").
ALTER TABLE "SupportSettings" ADD COLUMN IF NOT EXISTS "introEmbedId" TEXT;
