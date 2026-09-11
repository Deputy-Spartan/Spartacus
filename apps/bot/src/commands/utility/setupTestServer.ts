import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Guild,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { MODULE_KEYS, MODULE_LABELS, getModuleCategory, slugifyModuleLabel, VOICE_MODULE_KEYS } from "@spartacus/shared";
import type { CommandModule } from "../types";
import { isOwner } from "../../lib/owner";

// Scaffolds one category + one channel per dashboard module, derived live
// from MODULE_KEYS/MODULE_LABELS (packages/shared/moduleKeys.ts) — the same
// list the dashboard's own sidebar and module toggles are built from — so
// this can never drift out of sync with what's actually on the dashboard
// the way a hand-maintained channel list could. Every run computes a full
// plan (what's missing, what's stale) and asks for confirmation before
// touching anything; nothing is created or deleted automatically.
interface ChannelSpec {
  name: string;
  type: "text" | "voice";
}
interface CategorySpec {
  name: string;
  channels: ChannelSpec[];
}

// A few generic voice channels for testing features that need an actual
// populated voice channel (LFG, voice activity) rather than one dedicated
// to a single module.
const EXTRA_VOICE_CATEGORY: CategorySpec = {
  name: "🔊 voice testing",
  channels: [
    { name: "General VC", type: "voice" },
    { name: "Valorant Stack", type: "voice" },
    { name: "Movie Night", type: "voice" },
  ],
};

function buildLayout(): CategorySpec[] {
  const byCategory = new Map<string, ChannelSpec[]>();
  for (const key of MODULE_KEYS) {
    const category = getModuleCategory(key);
    const channel: ChannelSpec = {
      name: slugifyModuleLabel(MODULE_LABELS[key]),
      type: VOICE_MODULE_KEYS.has(key) ? "voice" : "text",
    };
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(channel);
  }
  const layout = [...byCategory.entries()].map(([name, channels]) => ({ name, channels }));
  layout.push(EXTRA_VOICE_CATEGORY);
  return layout;
}

interface Plan {
  categoriesToCreate: string[]; // category names that don't exist yet
  channelsToCreate: Array<{ categoryName: string; channel: ChannelSpec }>;
  staleChannelIds: string[];
  staleChannelLabels: string[];
  emptyCategoryIds: string[];
}

function computePlan(guild: Guild, layout: CategorySpec[]): Plan {
  const categoriesToCreate: string[] = [];
  const channelsToCreate: Plan["channelsToCreate"] = [];
  const staleChannelIds: string[] = [];
  const staleChannelLabels: string[] = [];
  const emptyCategoryIds: string[] = [];

  for (const category of layout) {
    const existingCategory = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === category.name);
    if (!existingCategory) {
      categoriesToCreate.push(category.name);
      for (const ch of category.channels) channelsToCreate.push({ categoryName: category.name, channel: ch });
      continue;
    }

    const currentNames = new Set(category.channels.map((ch) => ch.name.toLowerCase()));
    const children = guild.channels.cache.filter((c) => c.parentId === existingCategory.id);
    let kept = 0;

    for (const child of children.values()) {
      if (currentNames.has(child.name.toLowerCase())) kept++;
      else {
        staleChannelIds.push(child.id);
        staleChannelLabels.push(`#${child.name} (${category.name})`);
      }
    }
    if (kept === 0 && children.size > 0) emptyCategoryIds.push(existingCategory.id);

    for (const ch of category.channels) {
      const exists = [...children.values()].some((c) => c.name.toLowerCase() === ch.name.toLowerCase());
      if (!exists) channelsToCreate.push({ categoryName: category.name, channel: ch });
    }
  }

  return { categoriesToCreate, channelsToCreate, staleChannelIds, staleChannelLabels, emptyCategoryIds };
}

async function applyCreate(guild: Guild, layout: CategorySpec[], plan: Plan): Promise<{ created: number; failures: string[] }> {
  let created = 0;
  const failures: string[] = [];
  const categoryIdByName = new Map<string, string>();

  for (const name of new Set(plan.channelsToCreate.map((c) => c.categoryName))) {
    const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
    if (existing) {
      categoryIdByName.set(name, existing.id);
      continue;
    }
    try {
      const created = await guild.channels.create({ name, type: ChannelType.GuildCategory });
      categoryIdByName.set(name, created.id);
    } catch (err) {
      failures.push(`(category) ${name}`);
      console.error(`[setup-test-server] failed to create category "${name}":`, err);
    }
  }

  for (const { categoryName, channel } of plan.channelsToCreate) {
    const parentId = categoryIdByName.get(categoryName);
    if (!parentId) continue;
    try {
      await guild.channels.create({
        name: channel.name,
        type: channel.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
        parent: parentId,
      });
      created++;
    } catch (err) {
      failures.push(channel.name);
      console.error(`[setup-test-server] failed to create channel "${channel.name}":`, err);
    }
  }

  return { created, failures };
}

async function applyDelete(guild: Guild, plan: Plan): Promise<{ deletedChannels: number; deletedCategories: number }> {
  let deletedChannels = 0;
  let deletedCategories = 0;
  for (const id of plan.staleChannelIds) {
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel) {
      await channel.delete().catch(() => null);
      deletedChannels++;
    }
  }
  for (const id of plan.emptyCategoryIds) {
    const category = await guild.channels.fetch(id).catch(() => null);
    if (category) {
      await category.delete().catch(() => null);
      deletedCategories++;
    }
  }
  return { deletedChannels, deletedCategories };
}

// Keyed by a short random token embedded in each button's customId —
// deliberately in-memory rather than the database, since this is
// short-lived operational state for one owner-run command. A bot restart
// mid-confirmation just means re-running the command.
const pendingPlans = new Map<string, { guildId: string; plan: Plan; createdAt: number }>();
const CONFIRM_TTL_MS = 5 * 60 * 1000;
function pruneExpired() {
  const cutoff = Date.now() - CONFIRM_TTL_MS;
  for (const [token, pending] of pendingPlans) {
    if (pending.createdAt < cutoff) pendingPlans.delete(token);
  }
}

function summarize(plan: Plan): string {
  const parts: string[] = [];
  if (plan.channelsToCreate.length > 0) {
    parts.push(
      `✅ Would create ${plan.channelsToCreate.length} channel(s)` +
        (plan.categoriesToCreate.length > 0 ? ` and ${plan.categoriesToCreate.length} new categor${plan.categoriesToCreate.length === 1 ? "y" : "ies"}` : "") +
        "."
    );
  }
  if (plan.staleChannelIds.length > 0) {
    parts.push(
      `🗑️ Would remove ${plan.staleChannelIds.length} leftover channel(s) no longer matching any dashboard feature:\n` +
        plan.staleChannelLabels.slice(0, 15).join("\n") +
        (plan.staleChannelLabels.length > 15 ? `\n…and ${plan.staleChannelLabels.length - 15} more` : "") +
        (plan.emptyCategoryIds.length > 0 ? `\n(and ${plan.emptyCategoryIds.length} categor${plan.emptyCategoryIds.length === 1 ? "y" : "ies"} that'd be left empty)` : "")
    );
  }
  return parts.join("\n\n");
}

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("setup-test-server")
    .setDescription("Preview and sync a test channel for every dashboard feature.")
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

    const layout = buildLayout();
    const plan = computePlan(interaction.guild, layout);

    if (plan.channelsToCreate.length === 0 && plan.staleChannelIds.length === 0) {
      await interaction.reply({ content: "✅ Already up to date — every dashboard feature has a channel, nothing stale.", ephemeral: true });
      return;
    }

    pruneExpired();
    const token = Math.random().toString(36).slice(2, 10);
    pendingPlans.set(token, { guildId: interaction.guild.id, plan, createdAt: Date.now() });

    const buttons = [new ButtonBuilder().setCustomId(`setuptestserver:confirm:${token}`).setLabel("Confirm").setStyle(ButtonStyle.Success)];
    if (plan.channelsToCreate.length > 0 && plan.staleChannelIds.length > 0) {
      buttons.push(new ButtonBuilder().setCustomId(`setuptestserver:deleteonly:${token}`).setLabel("Delete stale only").setStyle(ButtonStyle.Danger));
    }
    buttons.push(new ButtonBuilder().setCustomId(`setuptestserver:skip:${token}`).setLabel("Skip").setStyle(ButtonStyle.Secondary));

    await interaction.reply({
      content: summarize(plan) + "\n\nWhat would you like to do?",
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
      ephemeral: true,
    });
  },
};

async function loadPending(interaction: ButtonInteraction, token: string) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: "This command is restricted to the bot owner.", ephemeral: true });
    return null;
  }
  const pending = pendingPlans.get(token);
  pendingPlans.delete(token);
  if (!pending || !interaction.guild || pending.guildId !== interaction.guild.id) {
    await interaction.update({ content: "This confirmation has expired — re-run `/setup-test-server` to get a fresh one.", components: [] });
    return null;
  }
  return pending;
}

export async function handleSetupTestServerConfirm(interaction: ButtonInteraction, token: string) {
  const pending = await loadPending(interaction, token);
  if (!pending) return;
  const guild = interaction.guild!;
  const layout = buildLayout();

  const { created, failures } = await applyCreate(guild, layout, pending.plan);
  const { deletedChannels, deletedCategories } = await applyDelete(guild, pending.plan);

  const parts = [`✅ Created ${created} channel(s).`, `🗑️ Removed ${deletedChannels} channel(s)${deletedCategories > 0 ? ` and ${deletedCategories} empty categor${deletedCategories === 1 ? "y" : "ies"}` : ""}.`];
  if (failures.length > 0) parts.push(`⚠️ Couldn't create: ${failures.join(", ")} — check my Manage Channels permission.`);
  await interaction.update({ content: parts.join("\n"), components: [] });
}

export async function handleSetupTestServerDeleteOnly(interaction: ButtonInteraction, token: string) {
  const pending = await loadPending(interaction, token);
  if (!pending) return;
  const { deletedChannels, deletedCategories } = await applyDelete(interaction.guild!, pending.plan);
  await interaction.update({
    content: `🗑️ Removed ${deletedChannels} channel(s)${deletedCategories > 0 ? ` and ${deletedCategories} empty categor${deletedCategories === 1 ? "y" : "ies"}` : ""}. Nothing was created.`,
    components: [],
  });
}

export async function handleSetupTestServerSkip(interaction: ButtonInteraction, token: string) {
  pendingPlans.delete(token);
  await interaction.update({ content: "Skipped — nothing was created or deleted.", components: [] });
}

export default command;
