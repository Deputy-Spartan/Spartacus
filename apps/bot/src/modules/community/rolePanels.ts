import { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { prisma } from "../../lib/prisma";
import { accessMessage, grantAccess, memberHasAccess, normalizeOption, revokeAccess, type PanelOption } from "../../lib/accessGrants";

// Options are addressed by position ("o0", "o1"…) in button ids and dropdown
// values; older posted messages still carry a bare role id, so fall back to
// matching that.
function findOption(options: PanelOption[], ref: string): PanelOption | undefined {
  const m = ref.match(/^o(\d+)$/);
  if (m) return options[Number(m[1])];
  return options.find((o) => o.roleIds.includes(ref));
}

async function loadPanel(panelId: string): Promise<{ options: PanelOption[]; notifyMode: string } | null> {
  const panel = await prisma.rolePanel.findUnique({ where: { id: panelId } });
  if (!panel) return null;
  return { options: (Array.isArray(panel.options) ? panel.options : []).map(normalizeOption), notifyMode: panel.notifyMode };
}

// PRIVATE = Discord's hidden "only you can see this" reply (it has its own
// Dismiss link). DM and NONE still have to acknowledge the click, so they
// defer silently first.
async function respond(interaction: ButtonInteraction | StringSelectMenuInteraction, mode: string, text: string, dmText?: string) {
  if (mode === "PRIVATE") {
    await interaction.reply({ content: text, ephemeral: true, allowedMentions: { parse: [] } });
    return;
  }
  await interaction.deferUpdate().catch(() => null);
  if (mode === "DM") await interaction.user.send(`**${interaction.guild?.name}** — ${dmText ?? text}`).catch(() => null);
}

export async function handleRolePanelButton(interaction: ButtonInteraction, panelId: string, ref: string) {
  if (!interaction.guild || !interaction.member) return;

  const panel = await loadPanel(panelId);
  const option = panel ? findOption(panel.options, ref) : undefined;
  if (!option) {
    await interaction.reply({ content: "This panel no longer exists.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const mode = panel!.notifyMode;
  try {
    if (memberHasAccess(member, option)) {
      await revokeAccess(member, option);
      await respond(interaction, mode, accessMessage(option, false), accessMessage(option, false, interaction.guild));
    } else {
      await grantAccess(member, option);
      await respond(interaction, mode, accessMessage(option, true), accessMessage(option, true, interaction.guild));
    }
  } catch {
    await respond(interaction, mode, "⚠️ I couldn't change that — check my role is above it and I can manage channels.");
  }
}

export async function handleRolePanelSelect(interaction: StringSelectMenuInteraction, panelId: string) {
  if (!interaction.guild) return;

  const panel = await loadPanel(panelId);
  if (!panel) {
    await interaction.reply({ content: "This role panel no longer exists.", ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const { options, notifyMode } = panel;
  const selected = new Set(interaction.values.map((v) => findOption(options, v)).filter((o): o is PanelOption => !!o));

  const lines: string[] = [];
  const dm = notifyMode === "DM";

  for (const option of options) {
    const has = memberHasAccess(member, option);
    const should = selected.has(option);
    if (should && !has) {
      await grantAccess(member, option).catch(() => null);
      lines.push(accessMessage(option, true, dm ? interaction.guild : undefined));
    } else if (!should && has) {
      await revokeAccess(member, option).catch(() => null);
      lines.push(accessMessage(option, false, dm ? interaction.guild : undefined));
    }
  }

  await respond(interaction, notifyMode, lines.length ? lines.join("\n") : "No changes made.");
}
