import type { ButtonInteraction } from "discord.js";
import { prisma } from "../../lib/prisma";

export async function handleGiveawayEntry(interaction: ButtonInteraction, giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId }, select: { ended: true } });
  if (!giveaway || giveaway.ended) {
    await interaction.reply({ content: "This giveaway has ended.", ephemeral: true });
    return;
  }
  const entered = await prisma.giveawayEntry.create({ data: { giveawayId, userId: interaction.user.id } }).then(
    () => true,
    (err: { code?: string }) => {
      if (err.code === "P2002") return false;
      throw err;
    }
  );
  await interaction.reply({ content: entered ? "🎉 You're entered!" : "You're already entered in this giveaway.", ephemeral: true });
}
