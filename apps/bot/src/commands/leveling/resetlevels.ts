import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

// /resetlevels: a fresh start for everyone. Sets every member's XP and level
// to 0 and takes the level roles (and stream chat-rank roles) off everyone.
// The roles themselves stay in the server, so the ladder keeps working.
// Prestige and coins are left alone. Admins only, with a confirm button.
const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("resetlevels")
    .setDescription("Reset everyone's XP and level to 0 and take the level roles off everyone")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return;
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "Spartacus needs the **Manage Roles** permission to take the level roles off.", ephemeral: true });
      return;
    }

    // Every role that levels hand out: the ladder and any other level links.
    const [links, plus, people] = await Promise.all([
      prisma.levelRole.findMany({ where: { guildId: guild.id }, select: { roleId: true } }),
      prisma.economyPlus.findUnique({ where: { guildId: guild.id }, select: { ladderRoles: true } }),
      prisma.memberXp.count({ where: { guildId: guild.id, OR: [{ xp: { gt: 0 } }, { level: { gt: 0 } }] } }),
    ]);
    const ids = new Set(links.map((l) => l.roleId));
    const saved = plus?.ladderRoles;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) for (const v of Object.values(saved)) if (typeof v === "string") ids.add(v);
    await guild.roles.fetch();
    const roles = [...ids].map((id) => guild.roles.cache.get(id)).filter((r): r is NonNullable<typeof r> => !!r && r.id !== guild.id && !r.managed);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("resetlevels:yes").setLabel("Yes, reset everyone").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("resetlevels:no").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    );
    const msg = await interaction.reply({
      content: [
        "## ⚠️ Reset all levels?",
        `• **${people}** member${people === 1 ? "" : "s"} go back to **level 0 with 0 XP**.`,
        `• These roles get taken off everyone: ${roles.length ? roles.map((r) => `<@&${r.id}>`).join(" ") : "_none found_"}`,
        "• The roles stay in the server, so people earn them again as they level up.",
        "• Prestige and coins are not touched.",
        "",
        "**This can't be undone.**",
      ].join("\n"),
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    const click = await msg
      .awaitMessageComponent({ componentType: ComponentType.Button, time: 60_000, filter: (i) => i.user.id === interaction.user.id })
      .catch(() => null);
    if (!click || click.customId !== "resetlevels:yes") {
      await interaction.editReply({ content: click ? "Cancelled. Nothing was changed." : "No answer, so nothing was changed.", components: [] });
      return;
    }
    await click.update({ content: "Resetting levels…", components: [] });

    // XP first, so nobody can level back up while the roles come off.
    const reset = await prisma.memberXp.updateMany({ where: { guildId: guild.id }, data: { xp: 0, level: 0 } });

    const top = me.roles.highest.position;
    const blocked = roles.filter((r) => r.position >= top);
    const removable = new Set(roles.filter((r) => r.position < top).map((r) => r.id));
    let changed = 0;
    let failed = 0;
    if (removable.size) {
      const members = await guild.members.fetch().catch(() => null);
      const wearing = members ? [...members.values()].filter((m) => m.roles.cache.some((r) => removable.has(r.id))) : [];
      let done = 0;
      for (const m of wearing) {
        const take = m.roles.cache.filter((r) => removable.has(r.id)).map((r) => r.id);
        const ok = await m.roles.remove(take, "Levels reset (/resetlevels)").then(() => true).catch(() => false);
        if (ok) changed++;
        else failed++;
        done++;
        if (done % 25 === 0) await interaction.editReply({ content: `Taking level roles off… ${done} / ${wearing.length}` }).catch(() => null);
      }
      if (!members) failed = -1;
    }

    const lines = [
      "## ✅ Levels reset",
      `• **${reset.count}** member${reset.count === 1 ? "" : "s"} set back to level 0 with 0 XP.`,
      `• Level roles taken off **${changed}** member${changed === 1 ? "" : "s"}.`,
    ];
    if (failed > 0) lines.push(`⚠️ Couldn't change ${failed} member${failed === 1 ? "" : "s"} (they may be above Spartacus). Run this again or remove those roles by hand.`);
    if (failed === -1) lines.push("⚠️ Couldn't load the member list, so no roles were taken off. Run this again in a minute.");
    if (blocked.length) lines.push(`⚠️ ${blocked.map((r) => `<@&${r.id}>`).join(" ")} sit above Spartacus's role, so Spartacus can't take them off. Move them below Spartacus in Server Settings → Roles and run this again.`);
    await interaction.editReply({ content: lines.join("\n") });
  },
};

export default command;
