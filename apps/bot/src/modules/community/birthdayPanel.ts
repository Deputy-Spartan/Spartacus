import {
  ActionRowBuilder,
  ButtonInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../lib/prisma";

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export async function handleBirthdayButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId("birthdaysetmodal")
    .setTitle("Set your birthday")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("month").setLabel("Month (1-12)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("day").setLabel("Day (1-31)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)
      )
    );
  await interaction.showModal(modal);
}

export async function handleBirthdaySetModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guildId) return;
  const month = Number(interaction.fields.getTextInputValue("month"));
  const day = Number(interaction.fields.getTextInputValue("day"));

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    await interaction.reply({ content: "That's not a valid date — double check the month and day.", ephemeral: true });
    return;
  }

  await prisma.birthday.upsert({
    where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
    create: { guildId: interaction.guildId, userId: interaction.user.id, month, day },
    update: { month, day },
  });

  await interaction.reply({ content: `🎂 Saved your birthday as **${month}/${day}**.`, ephemeral: true });
}
