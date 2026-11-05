import { PermissionFlagsBits, SlashCommandBuilder, type Role } from "discord.js";
import { LEVEL_LADDER } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { economyPlus } from "../../lib/economyPlus";
import type { CommandModule } from "../types";

// /levelroles: builds the level role ladder with this server's names and
// colors (set in Economy Hub → Level Roles), stacks them in order and links
// each to its level. Run it again after changing a name or color: the role
// already linked to that level is renamed and recolored, not made twice.
const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("levelroles")
    .setDescription("Create or update the colored level role ladder and link it to levels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return;
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "Spartacus needs the **Manage Roles** permission to make the level roles.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await guild.roles.fetch();
    const ladder = (await economyPlus(guild.id)).ladder;
    const linked = await prisma.levelRole.findMany({ where: { guildId: guild.id, level: { in: LEVEL_LADDER.map((r) => r.level) } } });
    const top = me.roles.highest.position;
    const lines: string[] = [];
    let made = 0;
    let updated = 0;
    let same = 0;
    const used = new Set<string>();

    const ids: string[] = [];
    for (const rung of ladder) {
      // The role already linked to this level, else one with this name.
      const linkedId = linked.find((l) => l.level === rung.level)?.roleId;
      let role: Role | undefined = linkedId ? guild.roles.cache.get(linkedId) : undefined;
      if (!role || used.has(role.id)) role = guild.roles.cache.find((r) => r.name === rung.name && !used.has(r.id) && !r.managed && r.id !== guild.id);
      if (role) {
        const changes: string[] = [];
        if (role.position >= top) {
          lines.push(`⚠️ **${role.name}** sits above Spartacus's role, so it can't be changed. Move it below Spartacus and run this again.`);
        } else {
          const oldName = role.name;
          if (role.name !== rung.name) {
            const ok = await role.setName(rung.name, "Level role ladder (/levelroles)").then(() => true).catch(() => false);
            changes.push(ok ? `renamed from **${oldName}**` : `⚠️ couldn't rename **${oldName}**`);
          }
          if (role.hexColor.toUpperCase() !== rung.color.toUpperCase()) {
            const ok = await role.setColor(rung.color as `#${string}`, "Level role ladder (/levelroles)").then(() => true).catch(() => false);
            changes.push(ok ? "new color" : "⚠️ couldn't change the color");
          }
        }
        if (changes.length) updated++;
        else same++;
        lines.push(`Level **${rung.level}** → <@&${role.id}> \`${rung.color}\`${changes.length ? ` (${changes.join(", ")})` : ""}`);
      } else {
        role = await guild.roles
          .create({ name: rung.name, color: rung.color as `#${string}`, permissions: [], mentionable: false, reason: `Level ${rung.level} role (/levelroles)` })
          .catch(() => undefined);
        if (!role) {
          lines.push(`⚠️ Couldn't create **${rung.name}**.`);
          continue;
        }
        made++;
        lines.push(`Level **${rung.level}** → <@&${role.id}> \`${rung.color}\` (new)`);
      }
      used.add(role.id);
      await prisma.levelRole.upsert({
        where: { guildId_level: { guildId: guild.id, level: rung.level } },
        create: { guildId: guild.id, level: rung.level, roleId: role.id },
        update: { roleId: role.id },
      });
      ids.push(role.id);
    }

    // Stack them just under Spartacus's own role, the lowest level lowest and
    // the top level highest, so the newest level role's color is the one that shows.
    let ordered = true;
    const movable = ids.filter((id) => (guild.roles.cache.get(id)?.position ?? 0) < top);
    if (movable.length) {
      await guild.roles.setPositions(movable.map((role, i) => ({ role, position: Math.max(1, top - movable.length + i) }))).catch(() => {
        ordered = false;
      });
    }
    if (!ordered) lines.push("⚠️ Couldn't put them in order. Drag them in Server Settings → Roles: the top level highest, all under Spartacus.");

    await interaction.editReply({
      content: [
        `**Level role ladder ready** (${made} made, ${updated} updated, ${same} already matched).`,
        "",
        ...lines,
        "",
        "Change names and colors any time in **Economy Hub → Level Roles**, then run `/levelroles` again.",
        "-# Colors only show if no higher colored role (like a staff role) sits above these. Spartacus's own role must stay above them.",
      ].join("\n"),
    });
  },
};

export default command;
