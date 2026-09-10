import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";

interface RolePanelOption {
  roleId: string;
  label: string;
  emoji?: string;
}

// Posts the button/dropdown panel for any RolePanel created or edited via
// the dashboard that doesn't have a live message yet (editing clears
// messageId so this redraws it).
export function startRolePanelPosterJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.rolePanel.findMany({ where: { messageId: null }, take: 20 });

    for (const panel of pending) {
      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const options: RolePanelOption[] = Array.isArray(panel.options) ? (panel.options as unknown as RolePanelOption[]) : [];
      if (options.length === 0) continue;

      const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle(panel.name)
        .setDescription(panel.description || "Click below to pick your roles.");

      const component =
        panel.layout === "DROPDOWN"
          ? new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`rolepanelselect:${panel.id}`)
                .setPlaceholder("Select your roles…")
                .setMinValues(0)
                .setMaxValues(options.length)
                .addOptions(
                  options.slice(0, 25).map((o) => ({
                    label: o.label,
                    value: o.roleId,
                    emoji: o.emoji || undefined,
                  }))
                )
            )
          : new ActionRowBuilder<ButtonBuilder>().addComponents(
              options.slice(0, 5).map((o) => {
                const button = new ButtonBuilder().setCustomId(`rolepanel:${panel.id}:${o.roleId}`).setLabel(o.label).setStyle(ButtonStyle.Secondary);
                if (o.emoji) button.setEmoji(o.emoji);
                return button;
              })
            );

      const message = await channel.send({ embeds: [embed], components: [component] }).catch((err) => {
        if (loggedThisTick < 5) { logError("bot", err, panel.guildId); loggedThisTick++; }
        return null;
      });
      if (message) await prisma.rolePanel.update({ where: { id: panel.id }, data: { messageId: message.id } });
    }
  });
}
