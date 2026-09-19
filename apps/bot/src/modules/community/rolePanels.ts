import { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { prisma } from "../../lib/prisma";
import { describeAccess, grantAccess, memberHasAccess, normalizeOption, revokeAccess, type PanelOption } from "../../lib/accessGrants";

// Options are addressed by position ("o0", "o1"…) in button ids and dropdown
// values; older posted messages still carry a bare role id, so fall back to
// matching that.
function findOption(options: PanelOption[], ref: string): PanelOption | undefined {
  const m = ref.match(/^o(\d+)$/);
  if (m) return options[Number(m[1])];
  return options.find((o) => o.roleIds.includes(ref));
}

async function loadOptions(panelId: string): Promise<PanelOption[] | null> {
  const panel = await prisma.rolePanel.findUnique({ where: { id: panelId } });
  if (!panel) return null;
  return (Array.isArray(panel.options) ? panel.options : []).map(normalizeOption);
}

export async function handleRolePanelButton(interaction: ButtonInteraction, panelId: string, ref: string) {
  if (!interaction.guild || !interaction.member) return;

  const options = await loadOptions(panelId);
  const option = options ? findOption(options, ref) : undefined;
  if (!option) {
    await interaction.reply({ content: "This panel no longer exists.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const summary = describeAccess(option);
  try {
    if (memberHasAccess(member, option)) {
      await revokeAccess(member, option);
      await interaction.reply({ content: `➖ Removed your access to ${summary}.`, ephemeral: true });
    } else {
      await grantAccess(member, option);
      await interaction.reply({ content: `➕ You now have access to ${summary}.`, ephemeral: true });
    }
  } catch {
    await interaction.reply({ content: "⚠️ I couldn't change that — check my role is above it and I can manage channels.", ephemeral: true });
  }
}

export async function handleRolePanelSelect(interaction: StringSelectMenuInteraction, panelId: string) {
  if (!interaction.guild) return;

  const options = await loadOptions(panelId);
  if (!options) {
    await interaction.reply({ content: "This role panel no longer exists.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const selected = new Set(interaction.values.map((v) => findOption(options, v)).filter((o): o is PanelOption => !!o));

  const added: string[] = [];
  const removed: string[] = [];

  for (const option of options) {
    const has = memberHasAccess(member, option);
    const should = selected.has(option);
    if (should && !has) {
      await grantAccess(member, option).catch(() => null);
      added.push(describeAccess(option));
    } else if (!should && has) {
      await revokeAccess(member, option).catch(() => null);
      removed.push(describeAccess(option));
    }
  }

  const parts = [added.length ? `➕ ${added.join(", ")}` : null, removed.length ? `➖ ${removed.join(", ")}` : null].filter(Boolean);
  await interaction.reply({
    content: parts.length ? `Updated your access: ${parts.join("  ")}` : "No changes made.",
    ephemeral: true,
  });
}
