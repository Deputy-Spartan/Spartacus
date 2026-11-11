import { PermissionFlagsBits, SlashCommandBuilder, type Role } from "discord.js";
import { LEVEL_LADDER } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { economyPlus } from "../../lib/economyPlus";
import type { CommandModule } from "../types";

// /levelroles: makes the server's level role ladder (set in Economy Hub →
// Level Roles) real. Each rung's role is remembered (ladderRoles), so running
// it again after an edit renames, recolors and re-links the same role, makes
// roles for new levels, and deletes the roles of levels that were removed.
const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("levelroles")
    .setDescription("Create or update the colored level role ladder from the Economy Hub")
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
    const top = me.roles.highest.position;
    const reason = "Level role ladder (/levelroles)";

    // Which role each rung used last time.
    const row = await prisma.economyPlus.findUnique({ where: { guildId: guild.id }, select: { ladderRoles: true } });
    const saved = row?.ladderRoles && typeof row.ladderRoles === "object" && !Array.isArray(row.ladderRoles) ? (row.ladderRoles as Record<string, unknown>) : null;
    const map: Record<string, string> = {};
    if (saved) {
      for (const [k, v] of Object.entries(saved)) if (typeof v === "string") map[k] = v;
    } else {
      // First run with remembered roles: the original ladder was linked by
      // level, so pick those roles up (only ones that look like ladder roles).
      const old = await prisma.levelRole.findMany({ where: { guildId: guild.id, level: { in: LEVEL_LADDER.map((r) => r.level) } } });
      for (const l of old) {
        const key = `l${l.level}`;
        const name = guild.roles.cache.get(l.roleId)?.name;
        if (name && (name === LEVEL_LADDER.find((r) => r.key === key)?.name || name === ladder.find((r) => r.key === key)?.name)) map[key] = l.roleId;
      }
    }
    const mappedIds = new Set(Object.values(map));
    const links = await prisma.levelRole.findMany({ where: { guildId: guild.id } });

    const lines: string[] = [];
    let made = 0;
    let updated = 0;
    let same = 0;
    let removed = 0;
    const next: Record<string, string> = {};
    const used = new Set<string>();
    const ids: string[] = [];

    for (const rung of ladder) {
      let role: Role | undefined = map[rung.key] ? guild.roles.cache.get(map[rung.key]) : undefined;
      if (role && used.has(role.id)) role = undefined;
      if (!role) role = guild.roles.cache.find((r) => r.name === rung.name && !used.has(r.id) && !mappedIds.has(r.id) && !r.managed && r.id !== guild.id);
      if (role) {
        const changes: string[] = [];
        if (role.position >= top) {
          lines.push(`⚠️ **${role.name}** sits above Spartacus's role, so it can't be changed. Move it below Spartacus and run this again.`);
        } else {
          const oldName = role.name;
          if (role.name !== rung.name) {
            const ok = await role.setName(rung.name, reason).then(() => true).catch(() => false);
            changes.push(ok ? `renamed from **${oldName}**` : `⚠️ couldn't rename **${oldName}**`);
          }
          if (role.hexColor.toUpperCase() !== rung.color.toUpperCase()) {
            const ok = await role.setColor(rung.color as `#${string}`, reason).then(() => true).catch(() => false);
            changes.push(ok ? "new color" : "⚠️ couldn't change the color");
          }
        }
        const roleId = role.id;
        const movedFrom = links.filter((l) => l.roleId === roleId && l.level !== rung.level).map((l) => l.level);
        if (movedFrom.length) changes.push(`moved from level ${movedFrom.join(", ")}`);
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
      next[rung.key] = role.id;
      // One link per rung: this level gives this role, and no other level does.
      await prisma.levelRole.deleteMany({ where: { guildId: guild.id, roleId: role.id, level: { not: rung.level } } });
      await prisma.levelRole.upsert({
        where: { guildId_level: { guildId: guild.id, level: rung.level } },
        create: { guildId: guild.id, level: rung.level, roleId: role.id },
        update: { roleId: role.id },
      });
      ids.push(role.id);
    }

    // Levels taken off the ladder: unlink and delete their roles.
    for (const [key, roleId] of Object.entries(map)) {
      if (key in next || used.has(roleId)) continue;
      await prisma.levelRole.deleteMany({ where: { guildId: guild.id, roleId } });
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      if (role.position >= top) {
        lines.push(`⚠️ **${role.name}** was removed from the ladder but sits above Spartacus, so delete it yourself.`);
        continue;
      }
      const name = role.name;
      const ok = await role.delete(reason).then(() => true).catch(() => false);
      if (ok) removed++;
      lines.push(ok ? `🗑️ **${name}** deleted (its level was removed)` : `⚠️ Couldn't delete **${name}**; it's unlinked, so delete it yourself.`);
    }

    await prisma.economyPlus.upsert({
      where: { guildId: guild.id },
      create: { guildId: guild.id, ladderRoles: next },
      update: { ladderRoles: next },
    });

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

    let content = [
      `**Level role ladder ready** (${made} made, ${updated} updated, ${same} already matched${removed ? `, ${removed} deleted` : ""}).`,
      "",
      ...lines,
      "",
      "Change levels, names and colors any time in **Economy Hub → Level Roles**, then run `/levelroles` again.",
      "-# Colors only show if no higher colored role (like a staff role) sits above these. Spartacus's own role must stay above them.",
    ].join("\n");
    if (content.length > 2000) content = content.slice(0, 1990) + "\n…";
    await interaction.editReply({ content });
  },
};

export default command;
