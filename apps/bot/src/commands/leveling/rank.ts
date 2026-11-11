import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { generateRankCard } from "../../lib/rankCard";
import { xpForLevel } from "@spartacus/shared";
import type { CommandModule } from "../types";

// 100 XP per level: the XP total needed for the next level.
function xpForNextLevel(level: number) {
  return xpForLevel(level + 1);
}

const command: CommandModule = {
  moduleKey: "RANK_CARDS",
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your (or someone else's) rank card")
    .addUserOption((o) => o.setName("user").setDescription("Member to check")) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId;

    const record = await prisma.memberXp.findUnique({
      where: { guildId_userId: { guildId, userId: target.id } },
    });

    if (!record) {
      await interaction.reply({
        content: target.id === interaction.user.id ? "You haven't earned any XP here yet." : "That member hasn't earned any XP here yet.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const rank = (await prisma.memberXp.count({ where: { guildId, xp: { gt: record.xp } } })) + 1;

    const buffer = await generateRankCard({
      username: target.username,
      avatarUrl: target.displayAvatarURL({ extension: "png" }),
      level: record.level,
      xp: record.xp,
      xpForNextLevel: xpForNextLevel(record.level),
      rank,
      prestige: record.prestige,
    });

    const attachment = new AttachmentBuilder(buffer, { name: "rank.png" });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
