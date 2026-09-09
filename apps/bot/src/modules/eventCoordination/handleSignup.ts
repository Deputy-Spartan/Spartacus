import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { SignupRole } from "@spartacus/shared";

const ROLE_FIELD_LABELS: Record<SignupRole, string> = {
  TANK: "🛡️ Tank",
  DPS: "⚔️ DPS",
  HEALER: "✨ Healer",
  ATTENDING: "✅ Attending",
  ABSENT: "❌ Absent",
  TENTATIVE: "❔ Tentative",
};

export async function handleEventSignupInteraction(interaction: ButtonInteraction) {
  const [, eventId, role] = interaction.customId.split(":") as [string, string, SignupRole];

  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { signups: true } });
  if (!event) {
    await interaction.reply({ content: "This event no longer exists.", ephemeral: true });
    return;
  }

  await prisma.eventSignup.upsert({
    where: { eventId_userId: { eventId, userId: interaction.user.id } },
    create: { eventId, userId: interaction.user.id, role },
    update: { role },
  });

  if (interaction.message.embeds.length === 0) {
    // Embed disabled for this event — RSVP is still recorded, there's just
    // no info card to update the role counts on.
    await interaction.reply({ content: `Marked you as **${ROLE_FIELD_LABELS[role]}**.`, ephemeral: true });
    return;
  }

  const signups = await prisma.eventSignup.findMany({ where: { eventId } });
  const grouped = signups.reduce<Record<SignupRole, string[]>>(
    (acc, s) => {
      acc[s.role as SignupRole] = [...(acc[s.role as SignupRole] ?? []), `<@${s.userId}>`];
      return acc;
    },
    { TANK: [], DPS: [], HEALER: [], ATTENDING: [], ABSENT: [], TENTATIVE: [] }
  );

  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setFields(
    interaction.message.embeds[0].fields.map((f) => {
      const entry = (Object.entries(ROLE_FIELD_LABELS) as [SignupRole, string][]).find(
        ([, label]) => label === f.name
      );
      if (!entry) return f;
      const [roleKey] = entry;
      const names = grouped[roleKey];
      return { ...f, value: names.length ? names.join("\n") : "—" };
    })
  );

  await interaction.update({ embeds: [embed] });
}
