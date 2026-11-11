import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../lib/prisma";
import { changeRole, parseDuration } from "../../modules/utility/roleManager";
import type { CommandModule } from "../types";

const command: CommandModule = {
  moduleKey: "ROLE_MANAGER",
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Give or take a member's roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Give a member a role, for good or for a set time")
        .addUserOption((o) => o.setName("member").setDescription("Who gets it").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("The role to give").setRequired(true))
        .addStringOption((o) => o.setName("for").setDescription("Only for this long, e.g. 30m, 2h, 3d, 1w. Leave empty to keep it.")),
    )
    .addSubcommand((s) =>
      s
        .setName("take")
        .setDescription("Take a role from a member")
        .addUserOption((o) => o.setName("member").setDescription("Who loses it").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("The role to take").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("See a member's roles")
        .addUserOption((o) => o.setName("member").setDescription("Whose roles").setRequired(true)),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return;
    const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!actor) return;

    // Manage Roles, or one of the staff roles picked on the dashboard.
    const cfg = await prisma.roleManagerConfig.findUnique({ where: { guildId: guild.id } });
    const allowed = actor.permissions.has(PermissionFlagsBits.ManageRoles) || (cfg?.staffRoleIds ?? []).some((r) => actor.roles.cache.has(r));
    if (!allowed) {
      await interaction.reply({ content: "You need Manage Roles, or one of the Role Manager staff roles, to use this.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("member", true);

    if (sub === "list") {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "That member isn't in the server.", ephemeral: true });
        return;
      }
      const roles = member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position);
      const timed = await prisma.timedRole.findMany({ where: { guildId: guild.id, userId: user.id } });
      const ends = new Map(timed.map((t) => [t.roleId, Math.floor(t.expiresAt.getTime() / 1000)]));
      const lines = roles.map((r) => `${r}${ends.has(r.id) ? ` · ends <t:${ends.get(r.id)}:R>` : ""}`);
      await interaction.reply({
        content: `**${member.displayName}** has ${roles.size} role${roles.size === 1 ? "" : "s"}:\n${lines.join("\n").slice(0, 1900) || "None"}`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const role = interaction.options.getRole("role", true);
    let minutes: number | null = null;
    const forText = interaction.options.getString("for");
    if (sub === "give" && forText) {
      minutes = parseDuration(forText);
      if (!minutes) {
        await interaction.reply({ content: "I couldn't read that time. Try something like 30m, 2h, 3d or 1w.", ephemeral: true });
        return;
      }
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await changeRole(
      guild,
      user.id,
      role.id,
      sub === "give" ? "GIVE" : "TAKE",
      { id: actor.id, name: actor.user.tag, isOwner: guild.ownerId === actor.id, member: actor },
      "DISCORD",
      minutes,
    );
    await interaction.editReply(`${result.ok ? "✅" : "⚠️"} ${result.message}`);
  },
};

export default command;
