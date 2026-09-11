import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { isOwner } from "../../lib/owner";

// One-time scaffolding command — creates a category + channel per dashboard
// feature so an admin can walk through every module in a fresh server
// without hand-building 50+ channels first. Purely additive: never deletes
// or touches anything that already exists, so it's safe to re-run (it'll
// just create a second set alongside — Discord allows duplicate names).
interface ChannelSpec {
  name: string;
  type: "text" | "voice";
}
interface CategorySpec {
  name: string;
  channels: ChannelSpec[];
}

const LAYOUT: CategorySpec[] = [
  {
    name: "🛡️ moderation",
    channels: [
      { name: "mod-log", type: "text" },
      { name: "cases-and-warnings", type: "text" },
      { name: "player-reports", type: "text" },
      { name: "mod-digest", type: "text" },
      { name: "warn-escalation-test", type: "text" },
      { name: "appeals", type: "text" },
    ],
  },
  {
    name: "🔒 security",
    channels: [
      { name: "ai-moderation-log", type: "text" },
      { name: "anti-raid-log", type: "text" },
      { name: "anti-nuke-log", type: "text" },
      { name: "server-backup-log", type: "text" },
      { name: "verify-here", type: "text" },
      { name: "rules", type: "text" },
      { name: "honeypot-do-not-click", type: "text" },
      { name: "perm-watch-log", type: "text" },
    ],
  },
  {
    name: "👋 community",
    channels: [
      { name: "welcome", type: "text" },
      { name: "reaction-roles", type: "text" },
      { name: "role-panels", type: "text" },
      { name: "join-roles-log", type: "text" },
      { name: "sticky-message-test", type: "text" },
      { name: "starboard", type: "text" },
      { name: "ai-chat", type: "text" },
      { name: "birthdays", type: "text" },
      { name: "member-milestones", type: "text" },
      { name: "anonymous", type: "text" },
      { name: "events", type: "text" },
      { name: "lfg-valorant", type: "text" },
    ],
  },
  {
    name: "📢 engagement",
    channels: [
      { name: "announcements", type: "text" },
      { name: "giveaways", type: "text" },
      { name: "stream-alerts", type: "text" },
      { name: "custom-commands-test", type: "text" },
      { name: "weekly-recap", type: "text" },
      { name: "bump-reminder", type: "text" },
      { name: "suggestions", type: "text" },
      { name: "partnerships", type: "text" },
    ],
  },
  {
    name: "🏆 levelling & economy",
    channels: [
      { name: "level-up-announcements", type: "text" },
      { name: "leaderboard", type: "text" },
      { name: "economy-shop", type: "text" },
      { name: "counting-game", type: "text" },
      { name: "growth-analytics-log", type: "text" },
    ],
  },
  {
    name: "🎫 support",
    channels: [
      { name: "ticket-panel", type: "text" },
      { name: "applications", type: "text" },
    ],
  },
  {
    name: "🧰 utility",
    channels: [
      { name: "channel-lock-test", type: "text" },
      { name: "slow-mode-test", type: "text" },
      { name: "status", type: "text" },
      { name: "error-log", type: "text" },
    ],
  },
  {
    name: "🔊 voice testing",
    channels: [
      { name: "member-count", type: "voice" },
      { name: "General VC", type: "voice" },
      { name: "Valorant Stack", type: "voice" },
      { name: "Movie Night", type: "voice" },
      { name: "Join to Create", type: "voice" },
    ],
  },
];

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("setup-test-server")
    .setDescription("Create a category + channel for every dashboard feature, for testing.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    // Restricted to the bot owner's own Discord account specifically — not
    // "any admin of any server this bot is in". setDefaultMemberPermissions
    // above only controls whether Discord's UI shows the command at all;
    // this is the actual gate.
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: "This command is restricted to the bot owner.", ephemeral: true });
      return;
    }

    const totalChannels = LAYOUT.reduce((sum, c) => sum + c.channels.length, 0);
    await interaction.reply({
      content: `🏗️ Syncing ${LAYOUT.length} categories and ${totalChannels} channels — creating anything missing, skipping anything that already exists. I'll edit this message when it's done.`,
      ephemeral: true,
    });

    let created = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const category of LAYOUT) {
      try {
        // Re-running this command later (e.g. after new features add new
        // entries to LAYOUT) should only create what's new, never duplicate
        // a category/channel that's already there from a previous run.
        const existingCategory = interaction.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && c.name === category.name
        );
        const categoryChannel =
          existingCategory ?? (await interaction.guild.channels.create({ name: category.name, type: ChannelType.GuildCategory }));

        for (const ch of category.channels) {
          const alreadyExists = interaction.guild.channels.cache.some(
            (c) => c.parentId === categoryChannel.id && c.name.toLowerCase() === ch.name.toLowerCase()
          );
          if (alreadyExists) {
            skipped++;
            continue;
          }
          try {
            await interaction.guild.channels.create({
              name: ch.name,
              type: ch.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
              parent: categoryChannel.id,
            });
            created++;
          } catch (err) {
            failures.push(ch.name);
            console.error(`[setup-test-server] failed to create channel "${ch.name}":`, err);
          }
        }
      } catch (err) {
        failures.push(`(category) ${category.name}`);
        console.error(`[setup-test-server] failed to create category "${category.name}":`, err);
      }
    }

    const summary =
      `✅ Created ${created} new channel(s), skipped ${skipped} that already existed, across ${LAYOUT.length} categories.\n\n` +
      "Next: open the Spartacus dashboard, enable the modules you want to test, and point each one at its matching channel. " +
      "Nothing existing was touched or deleted — safe to re-run any time (e.g. after a new feature ships) to pick up newly added test channels." +
      (failures.length > 0 ? `\n\n⚠️ Couldn't create: ${failures.join(", ")} — check my Manage Channels permission.` : "");

    await interaction.editReply({ content: summary });
  },
};

export default command;
