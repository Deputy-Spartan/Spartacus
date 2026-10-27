import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Guild,
  Message,
} from "discord.js";
import { NAV_SECTIONS, slugifyModuleLabel, VOICE_MODULE_KEYS } from "@spartacus/shared";
import { isOwner } from "../../lib/owner";

// Scaffolds one category per dashboard sidebar section and one channel per
// page in it, derived live from NAV_SECTIONS (packages/shared/navItems.ts) —
// the exact same list the dashboard's own sidebar is built from — so this
// can never drift out of sync with what's actually on the dashboard the way
// two hand-maintained copies eventually did. Every run computes a full plan
// (what's missing, what's misplaced, what's stale) and asks for confirmation
// before touching anything.
//
// Deliberately NOT a registered slash command — a slash command shows up in
// Discord's autocomplete for anyone with Administrator in any server this
// bot is in (setDefaultMemberPermissions only restricts who can run it, not
// who can see it exists). This is instead a plain "!setup-test-server" text
// trigger, checked directly against OWNER_DISCORD_ID in messageCreate.ts —
// nothing about it is ever registered with Discord, so it's invisible to
// literally everyone except whoever types the exact phrase, and it only
// does anything at all for the owner's own account.
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
  // Skip the top ungrouped items (Overview/Modules/Errors) and Owner Only —
  // neither represents a per-server feature worth a test channel.
  const layout = NAV_SECTIONS.filter((s) => s.section).map((section) => ({
    name: section.section as string,
    channels: section.items.map(
      (item): ChannelSpec => ({
        name: slugifyModuleLabel(item.label),
        type: item.moduleKey && VOICE_MODULE_KEYS.has(item.moduleKey) ? "voice" : "text",
      })
    ),
  }));
  layout.push(EXTRA_VOICE_CATEGORY);
  return layout;
}

// Strips a leading emoji/symbol (and the whitespace after it) so "🔵
// moderation" and a pre-emoji "Moderation" normalize to the same key —
// NAV_SECTIONS grew emoji prefixes at some point, and without this an old
// category never matches its current spec by exact name, so the script
// just builds a second one forever instead of recognizing it as the same
// category.
function normalizeCategoryName(name: string): string {
  return name
    .replace(/^[\p{Extended_Pictographic}‍️☀-➿]+\s*/u, "")
    .trim()
    .toLowerCase();
}

interface Plan {
  categoriesToCreate: string[]; // category names that don't exist yet
  // An existing category matches a spec'd one once emoji/casing is ignored,
  // but its literal name has drifted (e.g. "Moderation" vs "🔵 moderation")
  // — renamed in place rather than recreated so permission overrides stick.
  categoriesToRename: Array<{ id: string; from: string; to: string }>;
  channelsToCreate: Array<{ categoryName: string; channel: ChannelSpec }>;
  // A channel with the right name exists somewhere in the server but isn't
  // parented under the category it's supposed to be in (this is what a
  // botched category creation looks like — the channel got made but ended
  // up top-level). Fixed by moving it, not creating a duplicate.
  channelsToReparent: Array<{ channelId: string; label: string; targetCategoryName: string }>;
  staleChannelIds: string[];
  staleChannelLabels: string[];
  duplicateChannelIds: string[];
  duplicateChannelLabels: string[];
  emptyCategoryIds: string[];
  // A second (or third…) category that normalizes to the same name as one
  // already claimed as canonical — e.g. a leftover "Moderation" sitting
  // beside the current "🔵 moderation". Its channels get folded into the
  // canonical category (as reparents/stale above) and the now-empty shell
  // gets deleted here rather than left behind.
  duplicateCategoryIds: string[];
  duplicateCategoryLabels: string[];
}

function computePlan(guild: Guild, layout: CategorySpec[]): Plan {
  const byName = new Map<string, Array<{ id: string; name: string; parentId: string | null }>>();
  for (const c of guild.channels.cache.values()) {
    if (c.type === ChannelType.GuildCategory) continue;
    const key = c.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push({ id: c.id, name: c.name, parentId: c.parentId });
  }

  // Group existing categories by normalized name so every spelling/emoji
  // variant of e.g. "moderation" is recognized as the same logical category.
  const categoriesByNorm = new Map<string, Array<{ id: string; name: string }>>();
  for (const c of guild.channels.cache.values()) {
    if (c.type !== ChannelType.GuildCategory) continue;
    const key = normalizeCategoryName(c.name);
    if (!categoriesByNorm.has(key)) categoriesByNorm.set(key, []);
    categoriesByNorm.get(key)!.push({ id: c.id, name: c.name });
  }

  const claimedChannelIds = new Set<string>();
  const categoriesToCreate: string[] = [];
  const categoriesToRename: Plan["categoriesToRename"] = [];
  const channelsToCreate: Plan["channelsToCreate"] = [];
  const channelsToReparent: Plan["channelsToReparent"] = [];
  // Maps a layout category's spec name -> the real id/name of the single
  // canonical Discord category it resolves to (for channel matching below).
  const canonicalByLayoutName = new Map<string, { id: string; name: string } | null>();
  const claimedCategoryIds = new Set<string>();

  for (const category of layout) {
    const norm = normalizeCategoryName(category.name);
    const group = categoriesByNorm.get(norm) ?? [];
    // Prefer an exact-name match as canonical (already correctly named);
    // otherwise just take the first one found and rename it.
    const canonical = group.find((c) => c.name === category.name) ?? group[0] ?? null;

    if (!canonical) {
      categoriesToCreate.push(category.name);
    } else {
      claimedCategoryIds.add(canonical.id);
      if (canonical.name !== category.name) {
        categoriesToRename.push({ id: canonical.id, from: canonical.name, to: category.name });
      }
    }
    canonicalByLayoutName.set(category.name, canonical);

    for (const ch of category.channels) {
      const candidates = byName.get(ch.name.toLowerCase()) ?? [];
      const alreadyCorrect = canonical && candidates.find((c) => c.parentId === canonical.id);
      if (alreadyCorrect) {
        claimedChannelIds.add(alreadyCorrect.id);
        continue;
      }
      const misplaced = candidates.find((c) => !claimedChannelIds.has(c.id));
      if (misplaced) {
        claimedChannelIds.add(misplaced.id);
        channelsToReparent.push({ channelId: misplaced.id, label: `#${misplaced.name}`, targetCategoryName: category.name });
        continue;
      }
      channelsToCreate.push({ categoryName: category.name, channel: ch });
    }
  }

  // Any additional category in a normalized group beyond the canonical one
  // (e.g. a leftover plain "Moderation" beside the current "🔵 moderation")
  // is a duplicate shell — its channels get swept up as stale/reparented
  // below (the stale scan covers every category in a managed group, not
  // just the canonical one), and the empty shell itself is deleted here.
  const duplicateCategoryIds: string[] = [];
  const duplicateCategoryLabels: string[] = [];
  const managedCategoryIds = new Set<string>();
  for (const category of layout) {
    const norm = normalizeCategoryName(category.name);
    const group = categoriesByNorm.get(norm) ?? [];
    for (const c of group) {
      managedCategoryIds.add(c.id);
      if (!claimedCategoryIds.has(c.id)) {
        claimedCategoryIds.add(c.id); // avoid double-listing if norm somehow repeats
        duplicateCategoryIds.push(c.id);
        duplicateCategoryLabels.push(c.name);
      }
    }
  }

  // Any candidate sharing a spec'd channel's name that wasn't claimed above
  // (as the correctly-placed one or the one being reparented) is a true
  // duplicate — e.g. two "#lfg" channels anywhere in the server — and gets
  // deleted outright rather than left sitting around or silently ignored,
  // regardless of which category it happens to live in.
  const duplicateChannelIds: string[] = [];
  const duplicateChannelLabels: string[] = [];
  const specNames = new Set(layout.flatMap((c) => c.channels.map((ch) => ch.name.toLowerCase())));
  for (const name of specNames) {
    for (const c of byName.get(name) ?? []) {
      if (!claimedChannelIds.has(c.id)) {
        claimedChannelIds.add(c.id);
        duplicateChannelIds.push(c.id);
        duplicateChannelLabels.push(`#${c.name}`);
      }
    }
  }

  // Stale: anything currently sitting under ANY managed category (canonical
  // or a duplicate shell) that wasn't claimed above — i.e. doesn't match any
  // current spec for that category, so it's left over from a retired/renamed
  // feature (or belongs to a duplicate shell being merged away).
  const staleChannelIds: string[] = [];
  const staleChannelLabels: string[] = [];
  const emptyCategoryIds: string[] = [];

  const duplicateCategoryIdSet = new Set(duplicateCategoryIds);
  for (const cat of guild.channels.cache.values()) {
    if (cat.type !== ChannelType.GuildCategory || !managedCategoryIds.has(cat.id)) continue;
    const children = guild.channels.cache.filter((c) => c.parentId === cat.id);
    let kept = 0;
    for (const child of children.values()) {
      if (claimedChannelIds.has(child.id)) kept++;
      else {
        // Unclaimed child of any managed category (canonical or a
        // duplicate shell being merged away) — doesn't match any current
        // spec for it, so it's left over and gets deleted.
        staleChannelIds.push(child.id);
        staleChannelLabels.push(`#${child.name} (${cat.name})`);
      }
    }
    if (kept === 0 && children.size > 0 && !duplicateCategoryIdSet.has(cat.id)) emptyCategoryIds.push(cat.id);
  }

  return {
    categoriesToCreate,
    categoriesToRename,
    channelsToCreate,
    channelsToReparent,
    staleChannelIds,
    staleChannelLabels,
    duplicateChannelIds,
    duplicateChannelLabels,
    emptyCategoryIds,
    duplicateCategoryIds,
    duplicateCategoryLabels,
  };
}

async function ensureCategories(guild: Guild, names: string[]): Promise<{ ids: Map<string, string>; failures: string[] }> {
  const ids = new Map<string, string>();
  const failures: string[] = [];
  for (const name of names) {
    const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalizeCategoryName(c.name) === normalizeCategoryName(name));
    if (existing) {
      ids.set(name, existing.id);
      continue;
    }
    try {
      const created = await guild.channels.create({ name, type: ChannelType.GuildCategory });
      ids.set(name, created.id);
    } catch (err) {
      failures.push(`(category) ${name}`);
      console.error(`[setup-test-server] failed to create category "${name}":`, err);
    }
  }
  return { ids, failures };
}

async function applyRename(guild: Guild, plan: Plan): Promise<{ renamed: number; failures: string[] }> {
  const failures: string[] = [];
  let renamed = 0;
  for (const r of plan.categoriesToRename) {
    const category = await guild.channels.fetch(r.id).catch(() => null);
    if (!category) {
      failures.push(`(category) ${r.from}`);
      continue;
    }
    try {
      await category.setName(r.to);
      renamed++;
    } catch (err) {
      failures.push(`(category) ${r.from}`);
      console.error(`[setup-test-server] failed to rename category "${r.from}" -> "${r.to}":`, err);
    }
  }
  return { renamed, failures };
}

async function applyCreate(guild: Guild, plan: Plan): Promise<{ created: number; failures: string[] }> {
  const allCategoryNames = [...new Set([...plan.categoriesToCreate, ...plan.channelsToCreate.map((c) => c.categoryName)])];
  const { ids: categoryIdByName, failures } = await ensureCategories(guild, allCategoryNames);

  let created = 0;
  for (const { categoryName, channel } of plan.channelsToCreate) {
    const parentId = categoryIdByName.get(categoryName);
    if (!parentId) {
      failures.push(channel.name);
      continue;
    }
    try {
      const result = await guild.channels.create({
        name: channel.name,
        type: channel.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
        parent: parentId,
      });
      // Discord silently drops an invalid/stale parent instead of erroring
      // rather than failing the request — verify it actually landed where
      // it should so a bad parent id shows up as a loud failure, not a
      // second orphaned channel.
      if (result.parentId !== parentId) {
        failures.push(`${channel.name} (created but not in ${categoryName} — check permissions)`);
      } else {
        created++;
      }
    } catch (err) {
      failures.push(channel.name);
      console.error(`[setup-test-server] failed to create channel "${channel.name}":`, err);
    }
  }

  return { created, failures };
}

async function applyReparent(guild: Guild, plan: Plan): Promise<{ reparented: number; failures: string[] }> {
  const failures: string[] = [];
  let reparented = 0;
  const categoryNames = [...new Set(plan.channelsToReparent.map((r) => r.targetCategoryName))];
  const { ids: categoryIdByName, failures: categoryFailures } = await ensureCategories(guild, categoryNames);
  failures.push(...categoryFailures);

  for (const r of plan.channelsToReparent) {
    const parentId = categoryIdByName.get(r.targetCategoryName);
    if (!parentId) {
      failures.push(r.label);
      continue;
    }
    const channel = await guild.channels.fetch(r.channelId).catch(() => null);
    if (!channel || !("setParent" in channel) || typeof channel.setParent !== "function") {
      failures.push(r.label);
      continue;
    }
    try {
      await channel.setParent(parentId, { lockPermissions: false });
      reparented++;
    } catch (err) {
      failures.push(r.label);
      console.error(`[setup-test-server] failed to move "${r.label}" into ${r.targetCategoryName}:`, err);
    }
  }
  return { reparented, failures };
}

async function applyDelete(guild: Guild, plan: Plan): Promise<{ deletedChannels: number; deletedCategories: number }> {
  let deletedChannels = 0;
  let deletedCategories = 0;
  for (const id of [...plan.staleChannelIds, ...plan.duplicateChannelIds]) {
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel) {
      await channel.delete().catch(() => null);
      deletedChannels++;
    }
  }
  for (const id of [...plan.emptyCategoryIds, ...plan.duplicateCategoryIds]) {
    const category = await guild.channels.fetch(id).catch(() => null);
    if (category) {
      // Only safe to delete once empty — anything still under it (e.g. a
      // duplicate-shell channel that failed to reparent) would be lost.
      const stillHasChildren = guild.channels.cache.some((c) => c.parentId === id);
      if (stillHasChildren) continue;
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
  if (plan.categoriesToRename.length > 0) {
    parts.push(
      `🏷️ Would rename ${plan.categoriesToRename.length} categor${plan.categoriesToRename.length === 1 ? "y" : "ies"} to match the dashboard (same category, old naming — e.g. missing its emoji prefix):\n` +
        plan.categoriesToRename.map((r) => `${r.from} → ${r.to}`).join("\n")
    );
  }
  if (plan.duplicateCategoryIds.length > 0) {
    parts.push(
      `♻️ Would merge and delete ${plan.duplicateCategoryIds.length} duplicate categor${plan.duplicateCategoryIds.length === 1 ? "y" : "ies"} (leftover copy of a category that already exists under the current name):\n` +
        plan.duplicateCategoryLabels.join("\n")
    );
  }
  if (plan.channelsToCreate.length > 0) {
    parts.push(
      `✅ Would create ${plan.channelsToCreate.length} channel(s)` +
        (plan.categoriesToCreate.length > 0 ? ` and ${plan.categoriesToCreate.length} new categor${plan.categoriesToCreate.length === 1 ? "y" : "ies"}` : "") +
        "."
    );
  }
  if (plan.channelsToReparent.length > 0) {
    parts.push(
      `📦 Would move ${plan.channelsToReparent.length} existing channel(s) into their correct category (found the right channel, wrong place — e.g. sitting at the top level with no category):\n` +
        plan.channelsToReparent
          .slice(0, 15)
          .map((r) => `${r.label} → ${r.targetCategoryName}`)
          .join("\n") +
        (plan.channelsToReparent.length > 15 ? `\n…and ${plan.channelsToReparent.length - 15} more` : "")
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
  if (plan.duplicateChannelIds.length > 0) {
    parts.push(
      `♻️ Would delete ${plan.duplicateChannelIds.length} duplicate channel(s) (extra copies of a channel the layout already has elsewhere):\n` +
        plan.duplicateChannelLabels.slice(0, 15).join("\n") +
        (plan.duplicateChannelLabels.length > 15 ? `\n…and ${plan.duplicateChannelLabels.length - 15} more` : "")
    );
  }
  return parts.join("\n\n");
}

// Called from messageCreate.ts once it's already verified the message is
// exactly "!setup-test-server" from the owner's own account in a guild.
export async function runSetupTestServer(message: Message) {
  const guild = message.guild;
  if (!guild) return;

  const layout = buildLayout();
  const plan = computePlan(guild, layout);

  if (
    plan.categoriesToRename.length === 0 &&
    plan.duplicateCategoryIds.length === 0 &&
    plan.channelsToCreate.length === 0 &&
    plan.channelsToReparent.length === 0 &&
    plan.staleChannelIds.length === 0 &&
    plan.duplicateChannelIds.length === 0
  ) {
    await message.reply("✅ Already up to date — every dashboard feature has a correctly-placed channel, nothing stale.");
    return;
  }

  pruneExpired();
  const token = Math.random().toString(36).slice(2, 10);
  pendingPlans.set(token, { guildId: guild.id, plan, createdAt: Date.now() });

  const buttons = [new ButtonBuilder().setCustomId(`setuptestserver:confirm:${token}`).setLabel("Confirm").setStyle(ButtonStyle.Success)];
  const hasRemovals = plan.staleChannelIds.length > 0 || plan.duplicateChannelIds.length > 0 || plan.duplicateCategoryIds.length > 0;
  if ((plan.channelsToCreate.length > 0 || plan.channelsToReparent.length > 0) && hasRemovals) {
    buttons.push(new ButtonBuilder().setCustomId(`setuptestserver:deleteonly:${token}`).setLabel("Delete stale only").setStyle(ButtonStyle.Danger));
  }
  buttons.push(new ButtonBuilder().setCustomId(`setuptestserver:skip:${token}`).setLabel("Skip").setStyle(ButtonStyle.Secondary));

  await message.reply({
    content: summarize(plan) + "\n\nWhat would you like to do?",
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  });
}

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

  const { renamed, failures: renameFailures } = await applyRename(guild, pending.plan);
  const { created, failures: createFailures } = await applyCreate(guild, pending.plan);
  const { reparented, failures: reparentFailures } = await applyReparent(guild, pending.plan);
  const { deletedChannels, deletedCategories } = await applyDelete(guild, pending.plan);
  const failures = [...renameFailures, ...createFailures, ...reparentFailures];

  const parts = [
    `✅ Created ${created} channel(s).`,
    `🏷️ Renamed ${renamed} categor${renamed === 1 ? "y" : "ies"} to match the dashboard.`,
    `📦 Moved ${reparented} channel(s) into their correct category.`,
    `🗑️ Removed ${deletedChannels} channel(s)${deletedCategories > 0 ? ` and ${deletedCategories} categor${deletedCategories === 1 ? "y" : "ies"} (stale/duplicate)` : ""}.`,
  ];
  if (failures.length > 0) parts.push(`⚠️ Couldn't finish: ${failures.join(", ")} — check my Manage Channels permission.`);
  await interaction.update({ content: parts.join("\n"), components: [] });
}

export async function handleSetupTestServerDeleteOnly(interaction: ButtonInteraction, token: string) {
  const pending = await loadPending(interaction, token);
  if (!pending) return;
  const { deletedChannels, deletedCategories } = await applyDelete(interaction.guild!, pending.plan);
  await interaction.update({
    content: `🗑️ Removed ${deletedChannels} channel(s)${deletedCategories > 0 ? ` and ${deletedCategories} categor${deletedCategories === 1 ? "y" : "ies"} (stale/duplicate)` : ""}. Nothing was created, renamed, or moved.`,
    components: [],
  });
}

export async function handleSetupTestServerSkip(interaction: ButtonInteraction, token: string) {
  pendingPlans.delete(token);
  await interaction.update({ content: "Skipped — nothing was created, moved, or deleted.", components: [] });
}
