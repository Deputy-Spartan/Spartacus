import { SlashCommandBuilder } from "discord.js";
import { platformInfo } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { setTitle } from "../../modules/stream/accounts";
import type { CommandModule } from "../types";

// /title: change your stream title and game on every connected platform at
// once (Twitch and Kick, connected on the dashboard). Your live post in
// Discord picks up the change on its next refresh.
const command: CommandModule = {
  moduleKey: "STREAM_GROWTH",
  data: new SlashCommandBuilder()
    .setName("title")
    .setDescription("Change your stream title and game on Twitch and Kick")
    .setDMPermission(false)
    .addStringOption((o) => o.setName("title").setDescription("The new stream title").setMaxLength(140))
    .addStringOption((o) => o.setName("game").setDescription("The game or category, e.g. Rainbow Six Siege").setMaxLength(100))
    .addStringOption((o) => o.setName("platform").setDescription("Only change one (default: all connected)").addChoices({ name: "🟣 Twitch", value: "twitch" }, { name: "🟢 Kick", value: "kick" })) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const title = interaction.options.getString("title")?.trim() || null;
    const game = interaction.options.getString("game")?.trim() || null;
    const only = interaction.options.getString("platform");
    if (!title && !game) {
      await interaction.reply({ content: "Give a new title, a game, or both.", ephemeral: true });
      return;
    }
    const accounts = await prisma.streamerAccount.findMany({ where: { guildId: interaction.guildId, discordUserId: interaction.user.id, ...(only ? { platform: only } : {}) } });
    if (!accounts.length) {
      await interaction.reply({ content: "You haven't connected Twitch or Kick yet. Open the dashboard → Stream Growth → Accounts and press Connect.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const lines: string[] = [];
    for (const a of accounts) {
      const r = await setTitle(a, title, game).catch((e) => ({ ok: false, error: String(e), game: null }));
      const p = platformInfo(a.platform);
      if (r.ok) {
        lines.push(`✅ ${p.emoji} **${a.login}**: ${[title ? `title "${title}"` : null, r.game ? `game ${r.game}` : null].filter(Boolean).join(", ")}`);
        await prisma.streamSubscription.updateMany({
          where: { guildId: interaction.guildId, platform: a.platform, channelName: { equals: a.login, mode: "insensitive" } },
          data: { ...(title ? { lastTitle: title } : {}), ...(r.game ? { lastGame: r.game } : {}) },
        });
      } else lines.push(`⚠️ ${p.emoji} **${a.login}**: ${r.error}`);
    }
    await interaction.editReply(lines.join("\n"));
  },
};

export default command;
