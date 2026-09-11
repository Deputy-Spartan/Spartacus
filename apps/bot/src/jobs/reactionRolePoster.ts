import cron from "node-cron";
import { Client, EmbedBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { applyEmbedExtra } from "../lib/embedExtra";

const DEFAULT_DESCRIPTION = "React below to get a role.";

// Posts the message for any ReactionRolePanel that doesn't have one yet
// (created just now, or edited — editing clears messageId the same way
// RolePanel does, so this redraws it), then seeds the bot's own reaction
// for every emoji->role option so members have something to click. The
// actual role add/remove on click lives in modules/community/reactionRoles.ts
// and matches purely on messageId+emoji, so it didn't need to change here.
export function startReactionRolePosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.reactionRolePanel.findMany({
      where: { messageId: null },
      include: { options: true },
      take: 20,
    });

    for (const panel of pending) {
      if (!(await isModuleEnabled(panel.guildId, "REACTION_ROLES"))) continue;
      if (panel.options.length === 0) continue;

      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const listing = panel.options.map((o) => `${o.emoji} — <@&${o.roleId}>`).join("\n");
      const description = [panel.description || DEFAULT_DESCRIPTION, "", listing].join("\n");

      const payload = panel.embedEnabled
        ? {
            embeds: [
              applyEmbedExtra(
                new EmbedBuilder()
                  .setColor((panel.embedColor as `#${string}`) || "#5865F2")
                  .setTitle(panel.title || "Pick your roles")
                  .setDescription(description),
                panel.embedExtra
              ),
            ],
          }
        : { content: [panel.title, description].filter(Boolean).join("\n\n") };

      const message = await channel.send(payload).catch((err) => {
        if (loggedThisTick < 5) {
          logError("bot", err, panel.guildId);
          loggedThisTick++;
        }
        return null;
      });
      if (!message) continue;

      await prisma.reactionRolePanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
      await prisma.reactionRole.updateMany({ where: { panelId: panel.id }, data: { messageId: message.id } });

      for (const option of panel.options) {
        await message.react(option.emoji).catch(() => null);
      }
    }
  });
}
