import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type InteractionEditReplyOptions,
  type Interaction,
} from "discord.js";
import { ARCHIVE_CATEGORY, BLUEPRINT_GAMES, BLUEPRINT_LAYOUTS, DEFAULT_BLUEPRINT_GAMES, DEFAULT_STREAMING_GAMES, blueprintCategories, type BlueprintGameId, type BlueprintLayout } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { SETUP_PARTS, archiveOn, categoryOn, deleteOn, partOn, planSetup, runSetup, summarizePlan, type SetupOptions, type SetupPart } from "./serverSetup";

// A short list of names for the preview, like "#old-chat, #test and 4 more".
const names = (list: string[], max = 8) => (list.length <= max ? list.join(", ") : `${list.slice(0, max).join(", ")} and ${list.length - max} more`);

// One pending setup per person per server, so two admins can't clash.
const pending = new Map<string, SetupOptions & { expires: number }>();
const running = new Set<string>();
const PENDING_MS = 15 * 60_000;
const keyOf = (guildId: string, userId: string) => `${guildId}:${userId}`;

function missingBotPerms(guild: Guild): string[] {
  const me = guild.members.me;
  if (!me) return ["Spartacus isn't in this server"];
  if (me.permissions.has(PermissionFlagsBits.Administrator)) return [];
  const needed: Array<[bigint, string]> = [
    [PermissionFlagsBits.ManageRoles, "Manage Roles"],
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.ManageGuild, "Manage Server"],
    [PermissionFlagsBits.MoveMembers, "Move Members"],
  ];
  return needed.filter(([flag]) => !me.permissions.has(flag)).map(([, name]) => name);
}

// Start fresh (HQ): what gets deleted, what gets built. With `confirm`, the last-chance screen.
async function wipeScreen(guild: Guild, confirm = false): Promise<InteractionEditReplyOptions> {
  await Promise.all([guild.channels.fetch(), guild.roles.fetch(), guild.members.fetch()].map((p) => (p as Promise<unknown>).catch(() => null)));
  const top = guild.members.me?.roles.highest;
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread());
  const categories = all.filter((c) => c.type === ChannelType.GuildCategory).length;
  const channels = all.length - categories;
  const deletable = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed && !!top && top.comparePositionTo(r) > 0);
  const stuck = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed && !!top && top.comparePositionTo(r) <= 0);
  const people = new Set(deletable.flatMap((r) => [...r.members.keys()])).size;
  const hq = blueprintCategories([], "hq");
  const built = hq.reduce((n, c) => n + c.channels.length, 0);
  const lines = [
    confirm
      ? `This **permanently deletes everything** in **${guild.name}** and builds Spartacus HQ from scratch. It can't be undone.`
      : "Starts fresh, then builds **Spartacus HQ**: one clean server for testing Spartacus and supporting OG Armory customers.",
    "",
    `**🧹 Deleted first:** ${channels} channel${channels === 1 ? "" : "s"}, ${categories} categor${categories === 1 ? "y" : "ies"}, ${deletable.length} role${deletable.length === 1 ? "" : "s"}${people ? ` (taken off ${people} member${people === 1 ? "" : "s"}, staff included)` : ""}, and the onboarding questions. Messages in deleted channels are gone for good.`,
    `**🏗️ Then built:** 12 roles, ${hq.length} categories, ${built} channels, the rules, role and ticket panels, and 3 onboarding questions. The last question is the rules agreement.`,
    `**Stays:** @everyone, bot and booster roles${stuck.length ? `, and ${stuck.length} role${stuck.length === 1 ? "" : "s"} above Spartacus (${names(stuck.map((r) => r.name), 6)})` : ""}.`,
    "",
    "🗄️ A backup is saved first. It can rebuild channels and roles, **not messages or who had a role**.",
    "👥 Everyone already here keeps their place but loses their roles. They agree to the rules again in #📜・rules, and you give staff their roles back.",
    "📬 This message may vanish when its channel is deleted, so Spartacus also DMs you the result.",
  ];
  const embed = new EmbedBuilder()
    .setColor(confirm ? 0xed4245 : 0xf0b232)
    .setTitle(confirm ? `Delete everything in ${guild.name}?` : "🏗️ Server Setup · 🛠️ Spartacus HQ (start fresh)")
    .setDescription(lines.join("\n").slice(0, 4000))
    .setFooter({ text: confirm ? "Only you can see this." : "Only you can see this. Turn off Start fresh to keep what's here and only add or fix." });
  const buttons = confirm
    ? [
        new ButtonBuilder().setCustomId("srvsetup:confirm").setLabel("Yes, delete everything and build").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("srvsetup:back").setLabel("Go back").setStyle(ButtonStyle.Secondary),
      ]
    : [
        new ButtonBuilder().setCustomId("srvsetup:build").setLabel("Delete everything and build").setEmoji("🧨").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("srvsetup:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      ];
  const toggle = new StringSelectMenuBuilder()
    .setCustomId("srvsetup:part")
    .setPlaceholder("✅ Start fresh: delete everything first")
    .addOptions({ label: "Turn off Start fresh", value: "wipe", emoji: "🧨", description: "Keep what's here and only add or fix what's missing" });
  return {
    embeds: [embed],
    components: [...(confirm ? [] : [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(toggle)]), new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  };
}

async function planScreen(guild: Guild, opts: SetupOptions): Promise<InteractionEditReplyOptions> {
  if (opts.wipe) return wipeScreen(guild);
  const plan = await planSetup(guild, opts);
  const layout = BLUEPRINT_LAYOUTS.find((l) => l.id === (opts.layout ?? "gaming"))!;
  const del = deleteOn(opts);
  const fresh = !!opts.freshRoles && partOn(opts, "roles");
  const roleLabel = (r: { name: string; members: { size: number } }) => (r.members.size ? `${r.name} (${r.members.size})` : r.name);
  const s = summarizePlan(plan, opts);
  const line = (label: string, x: { reuse: number; create: number }) => `**${label}:** ${x.create} new${x.reuse ? `, ${x.reuse} of yours reused and renamed` : ""}`;
  const games = BLUEPRINT_GAMES.filter((g) => opts.games.includes(g.id));
  const categories = blueprintCategories(opts.games, opts.layout);
  const chosen = categories.filter((cat) => categoryOn(opts, cat.key));
  const top = guild.members.me?.roles.highest;
  const above = guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id && top !== undefined && r.position >= top.position).size;
  const on = SETUP_PARTS.filter((p) => partOn(opts, p.id));
  const skipped = (label: string) => `**${label}:** skipped`;
  const allCategories = chosen.length === categories.length;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🏗️ Server Setup · ${layout.emoji} ${layout.label}`)
    .setDescription(
      [
        opts.layout === "hq"
          ? "Builds **Spartacus HQ**: one clean server for testing Spartacus and supporting OG Armory customers. New people see only 📌 Start Here. Onboarding makes them agree to the rules, then asks what they're here for, and each answer opens its own section: 🛒 Store, 🤖 Spartacus Help or 🧪 Test Lab. 🎭・get-roles lets them change it later. Tickets open privately in 🗂️ Open Tickets, next to the store's website tickets."
          : opts.layout === "streaming"
          ? "Builds an open streaming community: stream alerts, clips, hangout, Matchmaking, supporters and creators, with nearly every module set up. Pick what to build below. Parts you skip stay as they are, and the parts you build reuse what's already there."
          : "Builds a clean layout for an FPS gaming community. Pick what to build below: everything, or only some parts and categories. Parts you skip stay as they are, and the parts you build use what's already there.",
        "",
        `**Building:** ${on.length ? on.map((p) => `${p.emoji} ${p.label}`).join(" · ") : "nothing yet"}`,
        partOn(opts, "roles") ? line("Roles", s.roles) : skipped("Roles"),
        partOn(opts, "channels") ? line("Categories", s.categories) : skipped("Categories"),
        partOn(opts, "channels") ? line("Channels", s.channels) : skipped("Channels"),
        partOn(opts, "channels") && !allCategories ? `**Only these categories:** ${chosen.map((cat) => cat.name).join(", ")}` : null,
        del
          ? [
              `**🧹 Deleted (unused):** ${s.deleteChannels} channel${s.deleteChannels === 1 ? "" : "s"} nobody has posted in for 30+ days${plan.deleteChannels.length ? ` (${names(plan.deleteChannels.map((c) => c.name))})` : ""}${fresh ? "" : `, ${s.deleteRoles} role${s.deleteRoles === 1 ? "" : "s"} nobody has${plan.deleteRoles.length ? ` (${names(plan.deleteRoles.map((r) => r.name))})` : ""}`}`,
              `**📦 Archived:** ${s.archive} channel${s.archive === 1 ? "" : "s"} with recent messages move into a hidden ${ARCHIVE_CATEGORY}${plan.archive.length ? ` (${names(plan.archive.map((c) => c.name))})` : ""}`,
            ].join("\n")
          : archiveOn(opts)
          ? `**Old channels:** ${s.archive} move into a hidden ${ARCHIVE_CATEGORY}`
          : opts.archiveOthers && partOn(opts, "channels") && !allCategories
            ? "**Old channels:** stay where they are (archiving only runs when every category is picked)"
            : "**Old channels:** stay where they are",
        fresh
          ? `**🎭 Fresh roles:** ${plan.deleteRoles.length} old role${plan.deleteRoles.length === 1 ? "" : "s"} not in the new layout get deleted, even if people have them (number of people in brackets)${plan.deleteRoles.length ? `: ${names(plan.deleteRoles.map(roleLabel), 12)}` : ""}. Roles that match the layout are reused, so people keep them. Roles with admin powers, bot roles and Discord's booster and Twitch roles stay.`
          : null,
        opts.layout === "hq" ? null : `**Games:** ${games.map((g) => `${g.emoji} ${g.name}`).join(", ")}`,
        "",
        del
          ? "🗄️ A backup is saved first. It can rebuild deleted channels and roles, but not the messages that were in them. Running it again only fixes what's missing."
          : "🗄️ A backup is saved first. Nothing is deleted, and running it again only fixes what's missing.",
        above && partOn(opts, "roles") ? `\n⚠️ ${above} role${above === 1 ? " is" : "s are"} above Spartacus's role, so ${above === 1 ? "it" : "they"} can't be renamed, sorted or given. Move Spartacus's role to the top in Server Settings → Roles for the best result.` : null,
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    )
    .setFooter({ text: "Only you can see this. Pick what to build, then tap Build." });

  // Single-pick menus that switch one thing at a time, so Discord never stacks picked chips over the message.
  const partMenu = new StringSelectMenuBuilder()
    .setCustomId("srvsetup:part")
    .setPlaceholder("Choose what to build")
    .addOptions(
      ...SETUP_PARTS.map((p) => ({
        label: `${partOn(opts, p.id) ? "✅" : "⬜"} ${p.label}`,
        value: p.id,
        emoji: p.emoji,
        description: `${partOn(opts, p.id) ? "Tap to skip" : "Tap to build"} · ${p.description}`.slice(0, 100),
      })),
      {
        label: `${opts.archiveOthers ? "✅" : "⬜"} Archive old channels`,
        value: "archive",
        emoji: "📦",
        description: `${opts.archiveOthers ? "Tap to skip" : "Tap to build"} · Move channels not in the layout into a hidden ${ARCHIVE_CATEGORY}`.slice(0, 100),
      },
      {
        label: `${opts.freshRoles ? "✅" : "⬜"} Fresh roles: delete every old role`,
        value: "fresh",
        emoji: "🎭",
        description: `${opts.freshRoles ? "Tap to keep old roles" : "Tap to turn on"} · Keeps only the layout's roles (and admin, bot, booster, Twitch)`.slice(0, 100),
      },
      {
        label: `${opts.deleteUnused ? "✅" : "⬜"} Delete unused channels and roles`,
        value: "delete",
        emoji: "🧹",
        description: `${opts.deleteUnused ? "Tap to archive them instead" : "Tap to delete"} · No posts in 30+ days, or nobody has the role`.slice(0, 100),
      },
      { label: "Build everything", value: "all", emoji: "🏗️", description: "Switch every part and category on" },
      ...(opts.layout === "hq" ? [{ label: "⬜ Start fresh: delete everything first", value: "wipe", emoji: "🧨", description: "Delete every channel, category, role and onboarding question, then build" }] : []),
    );
  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId("srvsetup:cat")
    .setPlaceholder(allCategories ? "Channels: all categories (tap to choose some)" : `Channels: ${chosen.length} of ${categories.length} categories`)
    .addOptions(
      ...categories.map((cat) => ({
        label: `${categoryOn(opts, cat.key) ? "✅" : "⬜"} ${cat.name}`.slice(0, 100),
        value: cat.key,
        description: `${categoryOn(opts, cat.key) ? "Tap to skip" : "Tap to build"} · ${cat.channels.length} channel${cat.channels.length === 1 ? "" : "s"}`,
      })),
      { label: "All categories", value: "all", emoji: "📁" },
    );
  const gameMenu = new StringSelectMenuBuilder()
    .setCustomId("srvsetup:game")
    .setPlaceholder("Add or drop a game")
    .addOptions(BLUEPRINT_GAMES.map((g) => ({ label: `${opts.games.includes(g.id) ? "Drop" : "Add"} ${g.name}`, value: g.id, emoji: g.emoji })));
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(partMenu),
      ...(partOn(opts, "channels") ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categoryMenu)] : []),
      ...(opts.layout === "hq" ? [] : [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameMenu)]),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("srvsetup:build").setLabel("Build").setEmoji("🏗️").setStyle(ButtonStyle.Success).setDisabled(on.length === 0 && !archiveOn(opts)),
        new ButtonBuilder().setCustomId("srvsetup:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// Deleting needs a second tap.
function confirmScreen(plan: Awaited<ReturnType<typeof planSetup>>, opts: SetupOptions): InteractionEditReplyOptions {
  const people = plan.deleteRoles.reduce((n, r) => n + r.members.size, 0);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Are you sure?")
        .setDescription(
          [
            `This **permanently deletes** ${plan.deleteChannels.length} channel${plan.deleteChannels.length === 1 ? "" : "s"} and ${plan.deleteRoles.length} role${plan.deleteRoles.length === 1 ? "" : "s"}:`,
            plan.deleteChannels.length ? `**Channels:** ${names(plan.deleteChannels.map((c) => `#${c.name}`), 25)}` : null,
            plan.deleteRoles.length ? `**Roles:** ${names(plan.deleteRoles.map((r) => (r.members.size ? `${r.name} (${r.members.size})` : r.name)), 25)}` : null,
            opts.freshRoles && people ? `⚠️ **Fresh roles is on:** people lose these roles (${people} role${people === 1 ? "" : "s"} taken off in total). They can pick their new ones in onboarding and 🎭・pick-roles.` : null,
            "",
            "A backup is saved first. It brings back the channels and roles, **not their messages or who had a role**. Everything else that isn't in the new layout moves into the hidden archive.",
          ]
            .filter((l): l is string => l !== null)
            .join("\n")
            .slice(0, 4000),
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("srvsetup:confirm").setLabel("Yes, build and delete").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("srvsetup:back").setLabel("Go back").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// `forced` is the layout a dedicated command always builds (/hq-setup builds "hq").
export async function runServerSetupCommand(interaction: ChatInputCommandInteraction, forced?: BlueprintLayout) {
  const guild = interaction.guild;
  if (!guild) return void (await interaction.reply({ content: "Run this inside a server.", ephemeral: true }));
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return void (await interaction.reply({ content: "You need Manage Server to run this.", ephemeral: true }));
  await interaction.deferReply({ ephemeral: true });
  const missing = missingBotPerms(guild);
  if (missing.length) return void (await interaction.editReply(`Spartacus needs these permissions first: ${missing.join(", ")}. Give its role Administrator, or those, in Server Settings → Roles.`));
  const layout = forced ?? ((interaction.options.getString("layout") ?? "gaming") as BlueprintLayout);
  const freshRoles = interaction.options.getBoolean("fresh-roles") ?? false;
  const games: BlueprintGameId[] = layout === "hq" ? [] : layout === "streaming" ? DEFAULT_STREAMING_GAMES : DEFAULT_BLUEPRINT_GAMES;
  const opts: SetupOptions & { expires: number } = {
    games: [...games],
    layout,
    // Spartacus HQ starts fresh unless that's switched off on the screen.
    wipe: layout === "hq",
    archiveOthers: true,
    // The streaming rebuild clears out what's unused by default; the gaming one only archives.
    deleteUnused: layout === "streaming",
    freshRoles,
    parts: SETUP_PARTS.map((p) => p.id),
    categories: blueprintCategories(games, layout).map((cat) => cat.key),
    expires: Date.now() + PENDING_MS,
  };
  pending.set(keyOf(guild.id, interaction.user.id), opts);
  await interaction.editReply(await planScreen(guild, opts));
}

export async function handleServerSetupInteraction(interaction: Interaction) {
  if (!(interaction.isButton() || interaction.isStringSelectMenu()) || !interaction.guild) return;
  const guild = interaction.guild;
  const key = keyOf(guild.id, interaction.user.id);
  const opts = pending.get(key);
  const action = interaction.customId.split(":")[1];
  try {
    if (!opts || opts.expires < Date.now()) return void (await interaction.update({ content: "This setup timed out. Run /server-setup again.", embeds: [], components: [] }));
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return void (await interaction.reply({ content: "You need Manage Server to do this.", ephemeral: true }));

    if (action === "cancel") {
      pending.delete(key);
      return void (await interaction.update({ content: "Canceled. Nothing was changed.", embeds: [], components: [] }));
    }
    if (interaction.isStringSelectMenu() && action === "game") {
      const id = interaction.values[0] as BlueprintGameId;
      if (opts.games.includes(id)) {
        if (opts.games.length > 1) opts.games = opts.games.filter((g) => g !== id);
      } else opts.games = BLUEPRINT_GAMES.map((g) => g.id).filter((g) => g === id || opts.games.includes(g));
      await interaction.deferUpdate();
      return void (await interaction.editReply(await planScreen(guild, opts)));
    }
    if (interaction.isStringSelectMenu() && action === "part") {
      const pick = interaction.values[0];
      if (pick === "all") {
        opts.parts = SETUP_PARTS.map((p) => p.id);
        opts.categories = blueprintCategories(opts.games, opts.layout).map((cat) => cat.key);
        opts.archiveOthers = true;
      } else if (pick === "wipe") {
        opts.wipe = !opts.wipe;
        opts.parts = SETUP_PARTS.map((p) => p.id);
        opts.categories = blueprintCategories(opts.games, opts.layout).map((cat) => cat.key);
      } else if (pick === "archive") opts.archiveOthers = !opts.archiveOthers;
      else if (pick === "fresh") opts.freshRoles = !opts.freshRoles;
      else if (pick === "delete") {
        opts.deleteUnused = !opts.deleteUnused;
        if (opts.deleteUnused) opts.archiveOthers = true;
      }
      else {
        const part = pick as SetupPart;
        const parts = opts.parts ?? SETUP_PARTS.map((p) => p.id);
        opts.parts = parts.includes(part) ? parts.filter((p) => p !== part) : SETUP_PARTS.map((p) => p.id).filter((p) => p === part || parts.includes(p));
      }
      await interaction.deferUpdate();
      return void (await interaction.editReply(await planScreen(guild, opts)));
    }
    if (interaction.isStringSelectMenu() && action === "cat") {
      const all = blueprintCategories(opts.games, opts.layout).map((cat) => cat.key);
      const pick = interaction.values[0];
      const current = opts.categories ?? all;
      if (pick === "all") opts.categories = all;
      // At least one category stays picked; skip Channels above to build none.
      else if (current.includes(pick)) {
        if (current.length > 1) opts.categories = current.filter((k) => k !== pick);
      } else opts.categories = all.filter((k) => k === pick || current.includes(k));
      await interaction.deferUpdate();
      return void (await interaction.editReply(await planScreen(guild, opts)));
    }
    if (interaction.isButton() && action === "build") {
      // Start fresh always asks a second time.
      if (opts.wipe) {
        await interaction.deferUpdate();
        return void (await interaction.editReply(await wipeScreen(guild, true)));
      }
      // Anything to delete? Ask once more first.
      if (deleteOn(opts) || opts.freshRoles) {
        await interaction.deferUpdate();
        const plan = await planSetup(guild, opts);
        if (plan.deleteChannels.length || plan.deleteRoles.length) return void (await interaction.editReply(confirmScreen(plan, opts)));
        return void (await build(interaction, opts, key, true));
      }
      return void (await build(interaction, opts, key));
    }
    if (interaction.isButton() && action === "confirm") {
      await interaction.deferUpdate();
      return void (await build(interaction, opts, key, true));
    }
    if (interaction.isButton() && action === "back") {
      await interaction.deferUpdate();
      return void (await interaction.editReply(await planScreen(guild, opts)));
    }
  } catch (err) {
    logError("bot", err, guild.id);
    await interaction.followUp({ content: "Something went wrong. Staff can see the details on the Errors page.", ephemeral: true }).catch(() => null);
  }
}

async function build(interaction: ButtonInteraction, opts: SetupOptions, key: string, deferred = false) {
  const guild = interaction.guild!;
  if (running.has(guild.id)) return void (await (deferred ? interaction.followUp({ content: "A setup is already running in this server.", ephemeral: true }) : interaction.reply({ content: "A setup is already running in this server.", ephemeral: true })));
  running.add(guild.id);
  pending.delete(key);
  const starting = { embeds: [new EmbedBuilder().setColor(0xf0b232).setTitle("🏗️ Building…").setDescription("Starting. This takes a minute or two.")], components: [] };
  await (deferred ? interaction.editReply(starting) : interaction.update(starting));
  const lines: string[] = [];
  const embedOf = (title: string, color: number, extra: string[] = []) => new EmbedBuilder().setColor(color).setTitle(title).setDescription([...lines, ...extra].join("\n").slice(0, 4000));
  // Start fresh deletes the channel this message lives in, so updates can fail; the result is DMed too.
  const show = (title: string, color: number, extra: string[] = []) => {
    const embed = embedOf(title, color, extra);
    if (opts.wipe && title !== "🏗️ Building…") void interaction.user.send({ content: `**${guild.name}**`, embeds: [embed] }).catch(() => null);
    return interaction.editReply({ embeds: [embed] }).catch(() => null);
  };
  try {
    const result = await runSetup(guild, opts, async (line) => {
      lines.push(line);
      await show("🏗️ Building…", 0xf0b232);
    });
    const notes = result.notes.length ? ["", "**Worth a look:**", ...result.notes.map((n) => `• ${n}`)] : [];
    const after = opts.layout === "hq"
      ? `The rules, role and ticket panels post themselves within a minute. Try it from a second account: you should see only 📌 Start Here until onboarding's last question, the rules.${opts.wipe ? " Give your staff 🎟️ Support Team, 🛡️ Moderator or ⚙️ Admin again." : ""}`
      : "Panels for rules, roles, support and Matchmaking post themselves within a minute.";
    await show("✅ Server Setup finished", 0x3ba55d, ["", `${after} Every module's settings are on the dashboard now.`, ...notes]);
  } catch (err) {
    logError("bot", err, guild.id);
    await show("⚠️ Server Setup stopped", 0xed4245, ["", "Something went wrong partway. Run /server-setup again to finish: it picks up where it stopped. Details are on the dashboard's Errors page."]);
  } finally {
    running.delete(guild.id);
  }
}
