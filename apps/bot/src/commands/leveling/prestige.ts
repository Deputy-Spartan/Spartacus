import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "PRESTIGE",
  data: new SlashCommandBuilder()
    .setName("prestige")
    .setDescription("Reset your level in exchange for a prestige rank, once you hit the max level") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const [record, settings] = await Promise.all([
      prisma.memberXp.findUnique({ where: { guildId_userId: { guildId, userId } } }),
      prisma.prestigeSettings.findUnique({ where: { guildId } }),
    ]);

    const maxLevel = settings?.maxLevel ?? 50;

    if (!record) {
      await interaction.reply({ content: "You haven't earned any XP here yet.", ephemeral: true });
      return;
    }

    if (record.level < maxLevel) {
      const remaining = maxLevel - record.level;
      await interaction.reply({
        content: `You need ${remaining} more level${remaining === 1 ? "" : "s"} before you can prestige (max level: ${maxLevel}).`,
        ephemeral: true,
      });
      return;
    }

    const updated = await prisma.memberXp.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level: 0, xp: 0, prestige: { increment: 1 } },
    });

    if (settings?.roleId) {
      const member = await interaction.guild?.members.fetch(userId).catch(() => null);
      await member?.roles.add(settings.roleId).catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setColor("#F5A623")
      .setTitle("⭐ Prestige!")
      .setDescription(`**${interaction.user.username}** has reached **Prestige ${updated.prestige}**! Your level has been reset to 0 — time to climb again.`);

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
