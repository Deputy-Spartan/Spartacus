import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { LEVEL_LADDER } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

// /levelroles: creates the level role ladder (names and colors from
// LEVEL_LADDER), in order so higher levels sit above lower ones, and links
// each to its level. Roles that already exist by name are reused, not made twice.
const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("levelroles")
    .setDescription("Create the colored level role ladder (Recruit to Spartan Legend) and link it to levels")
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
    const top = me.roles.highest.position;
    const lines: string[] = [];
    let made = 0;
    let reused = 0;

    const ids: string[] = [];
    for (const rung of LEVEL_LADDER) {
      let role = guild.roles.cache.find((r) => r.name === rung.name);
      if (role) {
        reused++;
        if (role.position < top && role.hexColor.toUpperCase() !== rung.color.toUpperCase()) await role.setColor(rung.color as `#${string}`, "Level role ladder").catch(() => null);
      } else {
        role = await guild.roles
          .create({ name: rung.name, color: rung.color as `#${string}`, permissions: [], mentionable: false, reason: `Level ${rung.level} role (/levelroles)` })
          .catch(() => undefined);
        if (!role) {
          lines.push(`⚠️ Couldn't create **${rung.name}**.`);
          continue;
        }
        made++;
      }
      await prisma.levelRole.upsert({
        where: { guildId_level: { guildId: guild.id, level: rung.level } },
        create: { guildId: guild.id, level: rung.level, roleId: role.id },
        update: { roleId: role.id },
      });
      ids.push(role.id);
      lines.push(`Level **${rung.level}** → <@&${role.id}> \`${rung.color}\``);
    }

    // Stack them just under Spartacus's own role, Recruit lowest and Spartan
    // Legend highest, so the newest level role's color is the one that shows.
    let ordered = true;
    if (ids.length) {
      await guild.roles.setPositions(ids.map((role, i) => ({ role, position: Math.max(1, top - ids.length + i) }))).catch(() => {
        ordered = false;
      });
    }
    if (!ordered) lines.push("⚠️ Couldn't put them in order. Drag them in Server Settings → Roles: Spartan Legend highest, Recruit lowest, all under Spartacus.");

    await interaction.editReply({
      content: [
        `**Level role ladder ready** (${made} made, ${reused} already there).`,
        "",
        ...lines,
        "",
        "Members get each role when they reach its level. With **Keep only the newest level role** on (Economy Hub), the lower ones come off so their name shows the newest color.",
        "-# Colors only show if no higher colored role (like a staff role) sits above these. Spartacus's own role must stay above them.",
      ].join("\n"),
    });
  },
};

export default command;
