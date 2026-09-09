import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { buildStickyPayload } from "../../lib/stickyRender";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "STICKY_MESSAGES",
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Manage sticky messages for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set (or replace) the sticky message for a channel")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel to sticky in").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
        .addStringOption((o) => o.setName("message").setDescription("The sticky message text").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove the sticky message from a channel")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel to remove the sticky from").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List all sticky messages in this server"))
    .addSubcommand((sub) =>
      sub
        .setName("preview")
        .setDescription("Post the current sticky for a channel here, without saving it as the active sticky")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel whose sticky to preview").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message", true);

      await prisma.stickyMessage.upsert({
        where: { channelId: channel.id },
        create: { guildId: interaction.guildId, channelId: channel.id, content: message },
        update: { content: message, embedEnabled: false, embedTitle: null, embedDescription: null, embedColor: null, buttons: [] },
      });

      await interaction.reply({ content: `📌 Sticky message set for <#${channel.id}>.`, ephemeral: true });
      return;
    }

    if (sub === "remove") {
      const channel = interaction.options.getChannel("channel", true);
      const existing = await prisma.stickyMessage.findUnique({ where: { channelId: channel.id } });
      if (!existing) {
        await interaction.reply({ content: `No sticky message is set for <#${channel.id}>.`, ephemeral: true });
        return;
      }

      if (existing.lastMessageId) {
        const ch = await interaction.guild?.channels.fetch(channel.id).catch(() => null);
        if (ch && isSendableChannel(ch)) {
          const old = await ch.messages.fetch(existing.lastMessageId).catch(() => null);
          await old?.delete().catch(() => null);
        }
      }

      await prisma.stickyMessage.delete({ where: { channelId: channel.id } });
      await interaction.reply({ content: `🗑️ Sticky message removed from <#${channel.id}>.`, ephemeral: true });
      return;
    }

    if (sub === "list") {
      const stickies = await prisma.stickyMessage.findMany({ where: { guildId: interaction.guildId } });
      if (stickies.length === 0) {
        await interaction.reply({ content: "No sticky messages are set up in this server yet.", ephemeral: true });
        return;
      }

      const lines = stickies.map((s) => `• <#${s.channelId}> — ${s.embedEnabled ? "embed" : "text"} sticky`);
      await interaction.reply({ content: `📌 ${stickies.length} sticky message(s) set up:\n${lines.join("\n")}`, ephemeral: true });
      return;
    }

    if (sub === "preview") {
      const channel = interaction.options.getChannel("channel", true);
      const sticky = await prisma.stickyMessage.findUnique({ where: { channelId: channel.id } });
      if (!sticky) {
        await interaction.reply({ content: `No sticky message is set for <#${channel.id}>.`, ephemeral: true });
        return;
      }

      await interaction.reply({ ...buildStickyPayload(sticky), ephemeral: true });
    }
  },
};

export default command;
