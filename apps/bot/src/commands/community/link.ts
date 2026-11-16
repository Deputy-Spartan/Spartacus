import { SlashCommandBuilder } from "discord.js";
import { KICK_LOGIN, TWITCH_LOGIN, cleanKickLogin, cleanTwitchLogin, makeLinkCode } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

// /link: connect your Twitch or Kick name to your Discord account, so chatting
// in a followed streamer's live chat earns rewards here and counts for Viewer
// of the Week. A code typed once in a live chat proves the name is yours. Kick
// codes come in through Kick's webhooks, so they only work in the chat of a
// Kick channel that's connected on the dashboard (Stream Growth → Accounts).
const NAMES: Record<string, string> = { twitch: "Twitch", kick: "Kick" };

const command: CommandModule = {
  moduleKey: "STREAM_EXTRAS",
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Twitch or Kick name to earn rewards for watching")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("twitch").setDescription("Link your Twitch name").addStringOption((o) => o.setName("name").setDescription("Your Twitch username").setRequired(true)))
    .addSubcommand((s) => s.setName("kick").setDescription("Link your Kick name").addStringOption((o) => o.setName("name").setDescription("Your Kick username").setRequired(true)))
    .addSubcommand((s) => s.setName("status").setDescription("See your links and what's left to do"))
    .addSubcommand((s) => s.setName("remove").setDescription("Unlink your Twitch and Kick names")) as SlashCommandBuilder,

  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) return;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });
    const all = await prisma.streamLink.findMany({ where: { guildId, userId } });

    if (sub === "remove") {
      if (all.length) await prisma.streamLink.deleteMany({ where: { guildId, userId } });
      await interaction.reply({ content: all.length ? `🗑️ Unlinked ${all.map((l) => `**${l.handle}** (${NAMES[l.platform] ?? l.platform})`).join(" and ")}.` : "You don't have anything linked.", ephemeral: true });
      return;
    }

    const steps = async (platform: string, code: string) => {
      const live = await prisma.streamSubscription.findMany({ where: { guildId, platform, isLive: true }, select: { channelName: true, displayName: true } });
      const liveText = live.length ? `Live now: ${live.map((s) => `**${s.displayName || s.channelName}**`).join(", ")}.` : "Nobody is live right now, so wait for a streamer to go live.";
      const where = platform === "kick" ? "the server's own Kick stream" : "a streamer from this server";
      return `1. Open the ${NAMES[platform]} chat of ${where} **while they're live**. ${liveText}\n2. Type this code there: \`${code}\`\n3. Spartacus sees it and sends you a DM to confirm.`;
    };

    if (sub === "status") {
      if (!all.length) {
        await interaction.reply({ content: "You haven't linked anything yet. Use `/link twitch` or `/link kick`.", ephemeral: true });
        return;
      }
      const lines: string[] = [];
      for (const l of all) lines.push(l.verified ? `✅ Linked to **${l.handle}** on ${NAMES[l.platform] ?? l.platform}.` : `⏳ **${l.handle}** (${NAMES[l.platform] ?? l.platform}) isn't confirmed yet.\n${await steps(l.platform, l.code)}`);
      if (!config?.rewardsEnabled) lines.push("*Rewards aren't switched on in this server yet.*");
      await interaction.reply({ content: lines.join("\n\n"), ephemeral: true });
      return;
    }

    const platform = sub === "kick" ? "kick" : "twitch";
    const mine = all.find((l) => l.platform === platform);
    const typed = interaction.options.getString("name", true);
    const login = platform === "kick" ? cleanKickLogin(typed) : cleanTwitchLogin(typed);
    if (!(platform === "kick" ? KICK_LOGIN : TWITCH_LOGIN).test(login)) {
      await interaction.reply({ content: `That doesn't look like a ${NAMES[platform]} username.`, ephemeral: true });
      return;
    }
    const taken = await prisma.streamLink.findUnique({ where: { guildId_platform_handle: { guildId, platform, handle: login } } });
    if (taken && taken.userId !== userId) {
      if (taken.verified) {
        await interaction.reply({ content: "Someone has already linked and confirmed that name here. If it's really yours, ask staff to unlink it.", ephemeral: true });
        return;
      }
      // An unconfirmed claim doesn't block the real owner.
      await prisma.streamLink.delete({ where: { id: taken.id } });
    }
    if (mine) await prisma.streamLink.delete({ where: { id: mine.id } });
    const code = makeLinkCode();
    await prisma.streamLink.create({ data: { guildId, userId, platform, handle: login, code } });
    await interaction.reply({
      content: `🔗 Linking **${login}** on ${NAMES[platform]}. To prove it's yours:\n${await steps(platform, code)}${config?.rewardsEnabled ? "" : "\n\n*Rewards aren't switched on in this server yet, but your link will be ready when they are.*"}`,
      ephemeral: true,
    });
  },
};

export default command;
