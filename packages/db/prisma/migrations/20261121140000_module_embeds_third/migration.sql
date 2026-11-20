-- Ticket opened message and Temp Channels panel/guide embeds. IF NOT EXISTS
-- because an earlier push briefly had these in the previous migration.
ALTER TABLE "TicketType" ADD COLUMN IF NOT EXISTS "savedEmbedId" TEXT;
ALTER TABLE "TempChannelLobby" ADD COLUMN IF NOT EXISTS "panelEmbedId" TEXT;
ALTER TABLE "TempChannelLobby" ADD COLUMN IF NOT EXISTS "guideEmbedId" TEXT;
