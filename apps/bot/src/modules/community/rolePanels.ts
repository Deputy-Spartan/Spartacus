import { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { prisma } from "../../lib/prisma";

interface RolePanelOption {
  roleId: string;
  label: string;
  emoji?: string;
}

export async function handleRolePanelButton(interaction: ButtonInteraction, panelId: string, roleId: string) {
  if (!interaction.guild || !interaction.member) return;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const hasRole = member.roles.cache.has(roleId);
  try {
    if (hasRole) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `➖ Removed <@&${roleId}>.`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `➕ Gave you <@&${roleId}>.`, ephemeral: true });
    }
  } catch {
    await interaction.reply({ content: "⚠️ I couldn't change that role — check my role is above it in the role list.", ephemeral: true });
  }
}

export async function handleRolePanelSelect(interaction: StringSelectMenuInteraction, panelId: string) {
  if (!interaction.guild) return;

  const panel = await prisma.rolePanel.findUnique({ where: { id: panelId } });
  if (!panel) {
    await interaction.reply({ content: "This role panel no longer exists.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const options: RolePanelOption[] = Array.isArray(panel.options) ? (panel.options as unknown as RolePanelOption[]) : [];
  const selected = new Set(interaction.values);

  const added: string[] = [];
  const removed: string[] = [];

  for (const option of options) {
    const hasRole = member.roles.cache.has(option.roleId);
    const shouldHave = selected.has(option.roleId);
    if (shouldHave && !hasRole) {
      await member.roles.add(option.roleId).catch(() => null);
      added.push(option.roleId);
    } else if (!shouldHave && hasRole) {
      await member.roles.remove(option.roleId).catch(() => null);
      removed.push(option.roleId);
    }
  }

  const parts = [
    added.length ? `+ ${added.map((r) => `<@&${r}>`).join(", ")}` : null,
    removed.length ? `- ${removed.map((r) => `<@&${r}>`).join(", ")}` : null,
  ].filter(Boolean);

  await interaction.reply({
    content: parts.length ? `Updated your roles: ${parts.join(" ")}` : "No changes made.",
    ephemeral: true,
  });
}
