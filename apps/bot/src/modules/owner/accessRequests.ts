import type { ButtonInteraction } from "discord.js";
import { prisma } from "../../lib/prisma";

// These buttons only ever appear in the DM the API sends to OWNER_DISCORD_ID
// (see apps/api/src/routes/access.ts) — but a DM's customId isn't
// inherently private, so this still checks the clicker is actually the
// owner rather than trusting "well, only they should have seen it".
function isOwner(userId: string): boolean {
  return !!process.env.OWNER_DISCORD_ID && userId === process.env.OWNER_DISCORD_ID;
}

function logAccessEvent(discordUserId: string, username: string, action: string, detail?: string) {
  prisma.accessAuditEntry.create({ data: { discordUserId, username, action, detail } }).catch(() => null);
}

export async function handleAccessApprove(interaction: ButtonInteraction, requestId: string) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: "Only the dashboard owner can approve access requests.", ephemeral: true });
    return;
  }

  const request = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    await interaction.update({ components: [] }).catch(() => null);
    await interaction.followUp({ content: "That request no longer exists — it may have already been handled.", ephemeral: true });
    return;
  }

  await prisma.dashboardAccess.upsert({
    where: { discordUserId: request.discordUserId },
    create: { discordUserId: request.discordUserId, username: request.username, plan: "FREE" },
    update: { username: request.username },
  });
  await prisma.accessRequest.delete({ where: { id: request.id } });
  logAccessEvent(request.discordUserId, request.username, "APPROVED", "via Discord DM");

  await interaction.client.users
    .send(request.discordUserId, {
      embeds: [
        {
          color: 0x22c55e,
          title: "✅ You've been approved!",
          description: "Your Spartacus dashboard access request was approved — head back to the dashboard to get started.",
        },
      ],
    })
    .catch(() => null);

  const original = interaction.message.embeds[0];
  await interaction
    .update({
      embeds: original
        ? [
            {
              ...original.toJSON(),
              color: 0x22c55e,
              footer: { text: `Approved by ${interaction.user.username}` },
            },
          ]
        : [],
      components: [],
    })
    .catch(() => null);
}

export async function handleAccessDeny(interaction: ButtonInteraction, requestId: string) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: "Only the dashboard owner can deny access requests.", ephemeral: true });
    return;
  }

  const request = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (request) {
    await prisma.accessRequest.delete({ where: { id: request.id } });
    logAccessEvent(request.discordUserId, request.username, "DENIED", "via Discord DM");

    await interaction.client.users
      .send(request.discordUserId, {
        embeds: [{ color: 0xef4444, title: "Access request denied", description: "Your Spartacus dashboard access request was not approved." }],
      })
      .catch(() => null);
  }

  const original = interaction.message.embeds[0];
  await interaction
    .update({
      embeds: original
        ? [
            {
              ...original.toJSON(),
              color: 0xef4444,
              footer: { text: `Denied by ${interaction.user.username}` },
            },
          ]
        : [],
      components: [],
    })
    .catch(() => null);
}
