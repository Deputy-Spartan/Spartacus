import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { CommandModule } from "../types";
import { isOwner } from "../../lib/owner";

// One-time (and re-runnable) scaffolding command — creates a category +
// channel per dashboard feature so an admin can walk through every module
// in a fresh server without hand-building 50+ channels first, and cleans up
// anything left behind by an older version of this list as features get
// renamed or retired. Creation is unconditionally safe (only ever adds
// what's missing); deletion only ever touches channels inside one of the
// named categories below, and only names that no longer appear in the
// current LAYOUT — anything you renamed or added yourself is left alone —
// and always requires an explicit confirm click before anything is removed.
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

// Keyed by a short random token embedded in the confirm/cancel button
// customIds — deliberately in-memory rather than the database, since this
// is short-lived operational state for one owner-run command, not data
// anything else needs to read. A bot restart mid-confirmation just means
// re-running the command; acceptable for a rarely-used utility.
interface PendingCleanup {
  guildId: string;
  channelIds: string[];
  categoryIds: string[];
  createdAt: number;
}
const pendingCleanups = new Map<string, PendingCleanup>();
const CONFIRM_TTL_MS = 5 * 60 * 1000;

function pruneExpired() {
  const cutoff = Date.now() - CONFIRM_TTL_MS;
  for (const [token, pending] of pendingCleanups) {
    if (pending.createdAt < cutoff) pendingCleanups.delete(token);
  }
}

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("setup-test-server")
    .setDescription("Create/clean up a category + channel per dashboard feature, for testing.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const guild = interaction.guild;

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
      content: `🏗️ Syncing ${LAYOUT.length} categories and ${totalChannels} channels — creating anything missing, skipping anything that already exists.`,
      ephemeral: true,
    });

    let created = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const category of LAYOUT) {
      try {
        const existingCategory = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === category.name);
        const categoryChannel = existingCategory ?? (await guild.channels.create({ name: category.name, type: ChannelType.GuildCategory }));

        for (const ch of category.channels) {
          const alreadyExists = guild.channels.cache.some(
            (c) => c.parentId === categoryChannel.id && c.name.toLowerCase() === ch.name.toLowerCase()
          );
          if (alreadyExists) {
            skipped++;
            continue;
          }
          try {
            await guild.channels.create({
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

    const createSummary =
      `✅ Created ${created} new channel(s), skipped ${skipped} that already existed, across ${LAYOUT.length} categories.\n\n` +
      "Next: open the Spartacus dashboard, enable the modules you want to test, and point each one at its matching channel." +
      (failures.length > 0 ? `\n\n⚠️ Couldn't create: ${failures.join(", ")} — check my Manage Channels permission.` : "");

    // --- Cleanup scan: only inside categories this command manages, and
    // only names that no longer appear in the current LAYOUT for that
    // category. A channel you renamed no longer matches an old name either,
    // so renaming a generated channel effectively adopts it out of cleanup.
    const staleChannelIds: string[] = [];
    const staleChannelLabels: string[] = [];
    const emptyCategoryIds: string[] = [];

    for (const category of LAYOUT) {
      const existingCategory = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === category.name);
      if (!existingCategory) continue;

      const currentNames = new Set(category.channels.map((ch) => ch.name.toLowerCase()));
      const children = guild.channels.cache.filter((c) => c.parentId === existingCategory.id);
      let keptCount = 0;

      for (const child of children.values()) {
        if (currentNames.has(child.name.toLowerCase())) {
          keptCount++;
        } else {
          staleChannelIds.push(child.id);
          staleChannelLabels.push(`#${child.name} (${category.name})`);
        }
      }

      if (keptCount === 0 && children.size > 0) {
        emptyCategoryIds.push(existingCategory.id);
      }
    }

    if (staleChannelIds.length === 0) {
      await interaction.editReply({ content: createSummary + "\n\nNothing to clean up — no leftover test channels found." });
      return;
    }

    pruneExpired();
    const token = Math.random().toString(36).slice(2, 10);
    pendingCleanups.set(token, {
      guildId: guild.id,
      channelIds: staleChannelIds,
      categoryIds: emptyCategoryIds,
      createdAt: Date.now(),
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`setuptestserver:confirm:${token}`).setLabel("Delete them").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`setuptestserver:cancel:${token}`).setLabel("Leave them").setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      content:
        createSummary +
        `\n\n🗑️ Found ${staleChannelIds.length} channel(s) left over from an older version of this list:\n` +
        staleChannelLabels.slice(0, 20).join("\n") +
        (staleChannelLabels.length > 20 ? `\n…and ${staleChannelLabels.length - 20} more` : "") +
        (emptyCategoryIds.length > 0 ? `\n\nThis would also empty out ${emptyCategoryIds.length} categor${emptyCategoryIds.length === 1 ? "y" : "ies"}, which will be deleted too.` : "") +
        "\n\nDelete them?",
      components: [row],
    });
  },
};

export async function handleSetupTestServerConfirm(interaction: ButtonInteraction, token: string) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: "This command is restricted to the bot owner.", ephemeral: true });
    return;
  }
  const pending = pendingCleanups.get(token);
  pendingCleanups.delete(token);
  if (!pending || !interaction.guild || pending.guildId !== interaction.guild.id) {
    await interaction.update({ content: "This cleanup confirmation has expired — re-run `/setup-test-server` to get a fresh one.", components: [] });
    return;
  }

  let deletedChannels = 0;
  let deletedCategories = 0;
  for (const id of pending.channelIds) {
    const channel = await interaction.guild.channels.fetch(id).catch(() => null);
    if (channel) {
      await channel.delete().catch(() => null);
      deletedChannels++;
    }
  }
  for (const id of pending.categoryIds) {
    const category = await interaction.guild.channels.fetch(id).catch(() => null);
    if (category) {
      await category.delete().catch(() => null);
      deletedCategories++;
    }
  }

  await interaction.update({
    content: `🗑️ Deleted ${deletedChannels} channel(s)${deletedCategories > 0 ? ` and ${deletedCategories} empty categor${deletedCategories === 1 ? "y" : "ies"}` : ""}.`,
    components: [],
  });
}

export async function handleSetupTestServerCancel(interaction: ButtonInteraction, token: string) {
  pendingCleanups.delete(token);
  await interaction.update({ content: "Left them as-is — nothing was deleted.", components: [] });
}

export default command;
