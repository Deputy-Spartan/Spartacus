import { SlashCommandBuilder } from "discord.js";
import { TWITCH_LOGIN, cleanTwitchLogin, makeLinkCode } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

// /link: connect your Twitch name to your Discord account, so chatting in a
// followed streamer's live chat earns rewards here. A code typed once in a live
// chat proves the Twitch name is yours.
const command: CommandModule = {
  moduleKey: "STREAM_EXTRAS",
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Twitch name to earn rewards for watching")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("twitch").setDescription("Link your Twitch name").addStringOption((o) => o.setName("name").setDescription("Your Twitch username").setRequired(true)))
    .addSubcommand((s) => s.setName("status").setDescription("See your link and what's left to do"))
    .addSubcommand((s) => s.setName("remove").setDescription("Unlink your Twitch name")) as SlashCommandBuilder,

  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) return;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    const mine = await prisma.streamLink.findUnique({ where: { guildId_userId_platform: { guildId, userId, platform: "twitch" } } });
    const config = await prisma.streamExtrasConfig.findUnique({ where: { guildId } });

    if (sub === "remove") {
      if (mine) await prisma.streamLink.delete({ where: { id: mine.id } });
      await interaction.reply({ content: mine ? "🗑️ Unlinked your Twitch name." : "You don't have a Twitch name linked.", ephemeral: true });
      return;
    }

    const live = await prisma.streamSubscription.findMany({ where: { guildId, platform: "twitch", isLive: true }, select: { channelName: true, displayName: true } });
    const liveText = live.length ? `Live now: ${live.map((s) => `**${s.displayName || s.channelName}**`).join(", ")}.` : "Nobody is live right now, so wait for a streamer to go live.";
    const steps = (code: string) =>
      `1. Open the Twitch chat of a streamer from this server **while they're live**. ${liveText}\n2. Type this code there: \`${code}\`\n3. Spartacus sees it and sends you a DM to confirm.`;

    if (sub === "status") {
      if (!mine) {
        await interaction.reply({ content: "You haven't linked a Twitch name yet. Use `/link twitch`.", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: mine.verified
          ? `✅ Linked to **${mine.handle}** on Twitch.${config?.rewardsEnabled ? "" : " Rewards aren't switched on in this server yet."}`
          : `⏳ **${mine.handle}** isn't confirmed yet.\n${steps(mine.code)}`,
        ephemeral: true,
      });
      return;
    }

    const login = cleanTwitchLogin(interaction.options.getString("name", true));
    if (!TWITCH_LOGIN.test(login)) {
      await interaction.reply({ content: "That doesn't look like a Twitch username.", ephemeral: true });
      return;
    }
    const taken = await prisma.streamLink.findUnique({ where: { guildId_platform_handle: { guildId, platform: "twitch", handle: login } } });
    if (taken && taken.userId !== userId) {
      if (taken.verified) {
        await interaction.reply({ content: "Someone has already linked and confirmed that Twitch name here. If it's really yours, ask staff to unlink it.", ephemeral: true });
        return;
      }
      // An unconfirmed claim doesn't block the real owner.
      await prisma.streamLink.delete({ where: { id: taken.id } });
    }
    if (mine) await prisma.streamLink.delete({ where: { id: mine.id } });
    const code = makeLinkCode();
    await prisma.streamLink.create({ data: { guildId, userId, platform: "twitch", handle: login, code } });
    await interaction.reply({
      content: `🔗 Linking **${login}**. To prove it's yours:\n${steps(code)}${config?.rewardsEnabled ? "" : "\n\n*Rewards aren't switched on in this server yet, but your link will be ready when they are.*"}`,
      ephemeral: true,
    });
  },
};

export default command;
