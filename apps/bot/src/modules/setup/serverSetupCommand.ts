import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type InteractionEditReplyOptions,
  type Interaction,
} from "discord.js";
import { ARCHIVE_CATEGORY, BLUEPRINT_GAMES, DEFAULT_BLUEPRINT_GAMES, blueprintCategories, type BlueprintGameId } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { SETUP_PARTS, archiveOn, categoryOn, partOn, planSetup, runSetup, summarizePlan, type SetupOptions, type SetupPart } from "./serverSetup";

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

async function planScreen(guild: Guild, opts: SetupOptions): Promise<InteractionEditReplyOptions> {
  const plan = await planSetup(guild, opts);
  const s = summarizePlan(plan, opts);
  const line = (label: string, x: { reuse: number; create: number }) => `**${label}:** ${x.create} new${x.reuse ? `, ${x.reuse} of yours reused and renamed` : ""}`;
  const games = BLUEPRINT_GAMES.filter((g) => opts.games.includes(g.id));
  const categories = blueprintCategories(opts.games);
  const chosen = categories.filter((cat) => categoryOn(opts, cat.key));
  const top = guild.members.me?.roles.highest;
  const above = guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id && top !== undefined && r.position >= top.position).size;
  const on = SETUP_PARTS.filter((p) => partOn(opts, p.id));
  const skipped = (label: string) => `**${label}:** skipped`;
  const allCategories = chosen.length === categories.length;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🏗️ Server Setup")
    .setDescription(
      [
        "Builds a clean layout for an FPS gaming community. Pick what to build below: everything, or only some parts and categories. Parts you skip stay as they are, and the parts you build use what's already there.",
        "",
        `**Building:** ${on.length ? on.map((p) => `${p.emoji} ${p.label}`).join(" · ") : "nothing yet"}`,
        partOn(opts, "roles") ? line("Roles", s.roles) : skipped("Roles"),
        partOn(opts, "channels") ? line("Categories", s.categories) : skipped("Categories"),
        partOn(opts, "channels") ? line("Channels", s.channels) : skipped("Channels"),
        partOn(opts, "channels") && !allCategories ? `**Only these categories:** ${chosen.map((cat) => cat.name).join(", ")}` : null,
        archiveOn(opts)
          ? `**Old channels:** ${s.archive} move into a hidden ${ARCHIVE_CATEGORY}`
          : opts.archiveOthers && partOn(opts, "channels") && !allCategories
            ? "**Old channels:** stay where they are (archiving only runs when every category is picked)"
            : "**Old channels:** stay where they are",
        `**Games:** ${games.map((g) => `${g.emoji} ${g.name}`).join(", ")}`,
        "",
        "🗄️ A backup is saved first. Nothing is deleted, and running it again only fixes what's missing.",
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
      { label: "Build everything", value: "all", emoji: "🏗️", description: "Switch every part and category on" },
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
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameMenu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("srvsetup:build").setLabel("Build").setEmoji("🏗️").setStyle(ButtonStyle.Success).setDisabled(on.length === 0 && !archiveOn(opts)),
        new ButtonBuilder().setCustomId("srvsetup:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function runServerSetupCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return void (await interaction.reply({ content: "Run this inside a server.", ephemeral: true }));
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return void (await interaction.reply({ content: "You need Manage Server to run this.", ephemeral: true }));
  await interaction.deferReply({ ephemeral: true });
  const missing = missingBotPerms(guild);
  if (missing.length) return void (await interaction.editReply(`Spartacus needs these permissions first: ${missing.join(", ")}. Give its role Administrator, or those, in Server Settings → Roles.`));
  const opts: SetupOptions & { expires: number } = {
    games: [...DEFAULT_BLUEPRINT_GAMES],
    archiveOthers: true,
    parts: SETUP_PARTS.map((p) => p.id),
    categories: blueprintCategories(DEFAULT_BLUEPRINT_GAMES).map((cat) => cat.key),
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
        opts.categories = blueprintCategories(opts.games).map((cat) => cat.key);
        opts.archiveOthers = true;
      } else if (pick === "archive") opts.archiveOthers = !opts.archiveOthers;
      else {
        const part = pick as SetupPart;
        const parts = opts.parts ?? SETUP_PARTS.map((p) => p.id);
        opts.parts = parts.includes(part) ? parts.filter((p) => p !== part) : SETUP_PARTS.map((p) => p.id).filter((p) => p === part || parts.includes(p));
      }
      await interaction.deferUpdate();
      return void (await interaction.editReply(await planScreen(guild, opts)));
    }
    if (interaction.isStringSelectMenu() && action === "cat") {
      const all = blueprintCategories(opts.games).map((cat) => cat.key);
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
    if (interaction.isButton() && action === "build") return void (await build(interaction, opts, key));
  } catch (err) {
    logError("bot", err, guild.id);
    await interaction.followUp({ content: "Something went wrong. Staff can see the details on the Errors page.", ephemeral: true }).catch(() => null);
  }
}

async function build(interaction: ButtonInteraction, opts: SetupOptions, key: string) {
  const guild = interaction.guild!;
  if (running.has(guild.id)) return void (await interaction.reply({ content: "A setup is already running in this server.", ephemeral: true }));
  running.add(guild.id);
  pending.delete(key);
  await interaction.update({ embeds: [new EmbedBuilder().setColor(0xf0b232).setTitle("🏗️ Building…").setDescription("Starting. This takes a minute or two.")], components: [] });
  const lines: string[] = [];
  const show = (title: string, color: number, extra: string[] = []) =>
    interaction.editReply({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription([...lines, ...extra].join("\n").slice(0, 4000))] });
  try {
    const result = await runSetup(guild, opts, async (line) => {
      lines.push(line);
      await show("🏗️ Building…", 0xf0b232);
    });
    const notes = result.notes.length ? ["", "**Worth a look:**", ...result.notes.map((n) => `• ${n}`)] : [];
    await show("✅ Server Setup finished", 0x3ba55d, ["", "Panels for rules, roles, support and Matchmaking post themselves within a minute. Every module's settings are on the dashboard now.", ...notes]);
  } catch (err) {
    logError("bot", err, guild.id);
    await show("⚠️ Server Setup stopped", 0xed4245, ["", "Something went wrong partway. Run /server-setup again to finish: it picks up where it stopped. Details are on the dashboard's Errors page."]);
  } finally {
    running.delete(guild.id);
  }
}
