-- The shop panel's own embed ("Build here" / "Use a saved embed").
ALTER TABLE "EconomyPlus" ADD COLUMN IF NOT EXISTS "shopPanelEmbedId" TEXT;
