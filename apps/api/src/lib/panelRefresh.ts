import { prisma } from "@spartacus/db";
import { getBotClient } from "./botClient";
import { deleteChannelMessage } from "./discordRest";

export type PanelKind = "reaction" | "panel";

// Edits a role panel's already-posted Discord message in place after a
// dashboard save, instead of posting a new copy. Needs the bot running in
// this process (RUN_BOT_INLINE, the production default). If it can't edit
// — bot not inline, message deleted, Discord error — the old message is
// removed and messageId cleared, so the panel's poster job sends a fresh
// one within a few seconds. Either way the channel ends with one panel.
export async function refreshPanelOrRepost(kind: PanelKind, id: string, channelId: string, messageId: string): Promise<void> {
  const client = getBotClient();
  let edited = false;
  if (client) {
    const bot = await import("@spartacus/bot");
    edited = await (kind === "reaction" ? bot.refreshReactionRolePanel(client, id) : bot.refreshRolePanel(client, id)).catch(() => false);
  }
  if (edited) return;

  await deleteChannelMessage(channelId, messageId).catch(() => null);
  if (kind === "reaction") {
    await prisma.reactionRolePanel.update({ where: { id }, data: { messageId: null } });
    await prisma.reactionRole.updateMany({ where: { panelId: id }, data: { messageId: null } });
  } else {
    await prisma.rolePanel.update({ where: { id }, data: { messageId: null } });
  }
}
