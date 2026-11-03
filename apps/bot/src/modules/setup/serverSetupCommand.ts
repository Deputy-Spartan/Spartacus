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
import { ARCHIVE_CATEGORY, BLUEPRINT_GAMES, DEFAULT_BLUEPRINT_GAMES, type BlueprintGameId } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { planSetup, runSetup, summarizePlan, type SetupOptions } from "./serverSetup";

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
  const s = summarizePlan(plan);
  const line = (label: string, x: { reuse: number; create: number }) => `**${label}:** ${x.create} new${x.reuse ? `, ${x.reuse} of yours reused and renamed` : ""}`;
  const games = BLUEPRINT_GAMES.filter((g) => opts.games.includes(g.id));
  const top = guild.members.me?.roles.highest;
  const above = guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id && top !== undefined && r.position >= top.position).size;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🏗️ Server Setup")
    .setDescription(
      [
        "Builds a clean layout for an FPS gaming community: roles, channels, voice, role pickers, onboarding, welcome and leave messages, tickets, applications, Matchmaking and more. Every module gets connected so the dashboard shows it.",
        "",
        line("Roles", s.roles),
        line("Categories", s.categories),
        line("Channels", s.channels),
        opts.archiveOthers ? `**Old channels:** ${s.archive} move into a hidden ${ARCHIVE_CATEGORY}` : "**Old channels:** stay where they are",
        `**Games:** ${games.map((g) => `${g.emoji} ${g.name}`).join(", ")}`,
        "",
        "🗄️ A backup is saved first. Nothing is deleted, and running it again only fixes what's missing.",
        above ? `\n⚠️ ${above} role${above === 1 ? " is" : "s are"} above Spartacus's role, so ${above === 1 ? "it" : "they"} can't be renamed or given. Move Spartacus's role to the top in Server Settings → Roles for the best result.` : "",
      ].join("\n"),
    )
    .setFooter({ text: "Only you can see this. Pick games or the archive choice below, then tap Build." });

  const gameMenu = new StringSelectMenuBuilder()
    .setCustomId("srvsetup:game")
    .setPlaceholder("Add or drop a game")
    .addOptions(BLUEPRINT_GAMES.map((g) => ({ label: `${opts.games.includes(g.id) ? "Drop" : "Add"} ${g.name}`, value: g.id, emoji: g.emoji })));
  const archiveMenu = new StringSelectMenuBuilder()
    .setCustomId("srvsetup:archive")
    .addOptions(
      { label: `Move old channels into a hidden ${ARCHIVE_CATEGORY}`, value: "yes", default: opts.archiveOthers },
      { label: "Leave old channels where they are", value: "no", default: !opts.archiveOthers },
    );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gameMenu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(archiveMenu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("srvsetup:build").setLabel("Build").setEmoji("🏗️").setStyle(ButtonStyle.Success),
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
  const opts = { games: [...DEFAULT_BLUEPRINT_GAMES], archiveOthers: true, expires: Date.now() + PENDING_MS };
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
    if (interaction.isStringSelectMenu() && action === "archive") {
      opts.archiveOthers = interaction.values[0] === "yes";
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
