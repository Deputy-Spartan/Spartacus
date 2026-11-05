import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type UserSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  BUILTIN_BADGES,
  DEFAULT_PROFILE_STATS,
  MAX_PROFILE_BADGES,
  MAX_PROFILE_GAMES,
  PROFILE_BIO_MAX,
  PROFILE_GAMES,
  PROFILE_THEMES,
  PROFILE_TITLES,
  cleanProfileStats,
  type ProfileStatKey,
  type ProfileTheme,
} from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { drawProfileCard, drawSideBySide, type ProfileCardData } from "../../lib/profileCardRender";

const xpForNextLevel = (level: number) => 5 * level * level + 50 * level + 100;
const num = (n: number) => n.toLocaleString("en-US");

type Earned = { type: string; emoji: string; label: string };

async function earnedBadges(guildId: string, userId: string): Promise<Earned[]> {
  const rows = await prisma.achievement.findMany({ where: { guildId, userId }, orderBy: { awardedAt: "desc" } });
  const customIds = rows.filter((r) => r.type.startsWith("CUSTOM:")).map((r) => r.type.slice(7));
  const customs = customIds.length ? await prisma.customAchievement.findMany({ where: { id: { in: customIds } } }) : [];
  const out: Earned[] = [];
  for (const r of rows) {
    if (BUILTIN_BADGES[r.type]) out.push({ type: r.type, ...BUILTIN_BADGES[r.type] });
    else if (r.type.startsWith("CUSTOM:")) {
      const c = customs.find((x) => x.id === r.type.slice(7));
      if (c) out.push({ type: r.type, emoji: c.emoji || "🏆", label: c.name });
    }
  }
  return out;
}

export async function profileSettings(guildId: string) {
  const s = await prisma.profileCardSettings.findUnique({ where: { guildId } });
  return { stats: s ? cleanProfileStats(s.stats) : DEFAULT_PROFILE_STATS, allowBios: s?.allowBios ?? true };
}

function themeFor(id: string | null | undefined): ProfileTheme {
  return PROFILE_THEMES.find((t) => t.id === id) ?? PROFILE_THEMES[0];
}

function themeUnlocked(t: ProfileTheme, level: number, owned: string[]): boolean {
  if (t.cost) return owned.includes(t.id);
  return !t.unlockLevel || level >= t.unlockLevel;
}

// Everything the card shows for one member.
export async function profileData(guild: Guild, userId: string): Promise<ProfileCardData> {
  const guildId = guild.id;
  const member = await guild.members.fetch(userId).catch(() => null);
  const user = member?.user ?? (await guild.client.users.fetch(userId).catch(() => null));
  const [card, xp, voice, eco, invites, matches, earned, settings] = await Promise.all([
    prisma.profileCard.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    prisma.memberXp.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    prisma.voiceActivity.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    prisma.inviteStat.findUnique({ where: { guildId_inviterId: { guildId, inviterId: userId } } }),
    prisma.matchPlayer.aggregate({ where: { guildId, userId }, _sum: { wins: true, losses: true } }),
    earnedBadges(guildId, userId),
    profileSettings(guildId),
  ]);
  const rank = xp ? (await prisma.memberXp.count({ where: { guildId, xp: { gt: xp.xp } } })) + 1 : null;
  const level = xp?.level ?? 0;

  const minutes = voice?.totalMinutes ?? 0;
  const values: Record<ProfileStatKey, string> = {
    rank: rank ? `#${num(rank)}` : "—",
    voice: minutes >= 60 ? `${num(Math.floor(minutes / 60))}h` : `${minutes}m`,
    matches: `${num(matches._sum.wins ?? 0)}W · ${num(matches._sum.losses ?? 0)}L`,
    coins: num(eco?.balance ?? 0),
    invites: num(invites?.uses ?? 0),
    achievements: num(earned.length),
    streak: `${eco?.dailyStreak ?? 0} days`,
  };
  const shortLabel: Record<ProfileStatKey, string> = { rank: "Rank", voice: "Voice", matches: "Matches", coins: "Coins", invites: "Invites", achievements: "Achievements", streak: "Streak" };

  const owned = card?.unlockedThemes ?? [];
  const chosenTheme = themeFor(card?.theme);
  const theme = themeUnlocked(chosenTheme, level, owned) ? chosenTheme : PROFILE_THEMES[0];
  const picked = (card?.badges ?? []).map((t) => earned.find((e) => e.type === t)).filter((e): e is Earned => !!e);
  const badges = (picked.length ? picked : earned).slice(0, MAX_PROFILE_BADGES);

  return {
    name: member?.displayName ?? user?.displayName ?? user?.username ?? "Member",
    avatarUrl: member?.displayAvatarURL({ extension: "png" }) ?? user?.displayAvatarURL({ extension: "png" }) ?? "",
    title: card?.title || "Member",
    bio: settings.allowBios ? card?.bio || null : null,
    theme,
    level,
    xp: xp?.xp ?? 0,
    xpForNextLevel: xpForNextLevel(level),
    prestige: xp?.prestige ?? 0,
    streak: eco?.dailyStreak ?? 0,
    memberSince: member?.joinedAt ? member.joinedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null,
    stats: settings.stats.map((k) => [shortLabel[k], values[k]] as [string, string]),
    badges: badges.map((b) => ({ emoji: b.emoji, label: b.label })),
    games: (card?.games ?? []).slice(0, MAX_PROFILE_GAMES),
    serverName: guild.name,
  };
}

export async function renderProfile(guild: Guild, userId: string): Promise<Buffer> {
  return drawProfileCard(await profileData(guild, userId));
}

function cardButtons(shownUserId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("pcard:edit").setLabel("Edit my card").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pcard:cmp:${shownUserId}`).setLabel("Compare with me").setEmoji("⚔️").setStyle(ButtonStyle.Secondary)
  );
}

// /profile [user] [compare_with]
export async function runProfileCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const target = interaction.options.getUser("user") ?? interaction.user;
  const other = interaction.options.getUser("compare_with");
  if (target.bot || other?.bot) {
    await interaction.reply({ content: "Bots don't have profile cards.", ephemeral: true });
    return;
  }
  await interaction.deferReply();
  if (other && other.id !== target.id) {
    const [a, b] = await Promise.all([renderProfile(interaction.guild, target.id), renderProfile(interaction.guild, other.id)]);
    await interaction.editReply({ files: [new AttachmentBuilder(await drawSideBySide(a, b), { name: "compare.png" })], components: [cardButtons(target.id)] });
    return;
  }
  const png = await renderProfile(interaction.guild, target.id);
  await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "profile.png" })], components: [cardButtons(target.id)] });
}

// ---- The edit menu (only the member themselves sees it) ----

async function editorView(guild: Guild, userId: string, note?: string) {
  const [card, xp, earned, settings] = await Promise.all([
    prisma.profileCard.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } }),
    prisma.memberXp.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } }),
    earnedBadges(guild.id, userId),
    profileSettings(guild.id),
  ]);
  const level = xp?.level ?? 0;
  const owned = card?.unlockedThemes ?? [];
  const current = themeFor(card?.theme);
  const title = card?.title || "Member";
  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [];

  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("pcard:title")
        .setPlaceholder("Title")
        .addOptions(PROFILE_TITLES.map((t) => ({ label: t, value: t, default: t === title })))
    )
  );
  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("pcard:theme")
        .setPlaceholder("Theme")
        .addOptions(
          PROFILE_THEMES.map((t) => {
            const open = themeUnlocked(t, level, owned);
            const why = t.cost ? `Costs ${num(t.cost)} coins` : `Unlocks at level ${t.unlockLevel}`;
            return { label: open ? t.name : `${t.name} 🔒`, value: t.id, description: open ? "Unlocked" : why, default: t.id === current.id };
          })
        )
    )
  );
  const chosenBadges = (card?.badges ?? []).filter((b) => earned.some((e) => e.type === b));
  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      earned.length
        ? new StringSelectMenuBuilder()
            .setCustomId("pcard:badges")
            .setPlaceholder(`Badges to show (up to ${MAX_PROFILE_BADGES})`)
            .setMinValues(0)
            .setMaxValues(Math.min(MAX_PROFILE_BADGES, earned.length))
            .addOptions(earned.slice(0, 25).map((e) => ({ label: e.label.slice(0, 100), value: e.type, emoji: e.emoji.startsWith("<") ? undefined : e.emoji, default: chosenBadges.includes(e.type) })))
        : new StringSelectMenuBuilder().setCustomId("pcard:badges").setPlaceholder("No badges yet: earn achievements to unlock them").setDisabled(true).addOptions({ label: "None", value: "none" })
    )
  );
  const games = card?.games ?? [];
  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("pcard:games")
        .setPlaceholder(`Games you play (up to ${MAX_PROFILE_GAMES})`)
        .setMinValues(0)
        .setMaxValues(MAX_PROFILE_GAMES)
        .addOptions(PROFILE_GAMES.map((g) => ({ label: g, value: g, default: games.includes(g) })))
    )
  );
  const buttons = new ActionRowBuilder<ButtonBuilder>();
  if (settings.allowBios) buttons.addComponents(new ButtonBuilder().setCustomId("pcard:bio").setLabel(card?.bio ? "Edit bio" : "Add a bio").setEmoji("📝").setStyle(ButtonStyle.Secondary));
  buttons.addComponents(new ButtonBuilder().setCustomId("pcard:preview").setLabel("Preview").setEmoji("👀").setStyle(ButtonStyle.Primary));
  const gold = PROFILE_THEMES.find((t) => t.cost && !owned.includes(t.id));
  if (gold) buttons.addComponents(new ButtonBuilder().setCustomId(`pcard:buy:${gold.id}`).setLabel(`Buy ${gold.name} (${num(gold.cost as number)} coins)`).setEmoji("🪙").setStyle(ButtonStyle.Secondary));
  rows.push(buttons);

  const lines = [
    "**✏️ Edit your profile card**",
    `Title: **${title}** · Theme: **${current.name}** · Badges: ${chosenBadges.length ? chosenBadges.map((b) => earned.find((e) => e.type === b)?.emoji).join(" ") : earned.length ? "your latest" : "none yet"}`,
    `Games: ${games.length ? games.join(", ") : "none picked"}${settings.allowBios ? ` · Bio: ${card?.bio ? `“${card.bio}”` : "none"}` : ""}`,
    "Changes save straight away. Use **/profile** to show your card.",
  ];
  if (note) lines.push(`\n${note}`);
  return { content: lines.join("\n"), components: rows };
}

async function saveCard(guildId: string, userId: string, data: Partial<{ title: string; bio: string | null; theme: string; badges: string[]; games: string[]; unlockedThemes: string[] }>) {
  await prisma.profileCard.upsert({ where: { guildId_userId: { guildId, userId } }, create: { guildId, userId, ...data }, update: data });
}

async function bioProblem(guildId: string, bio: string): Promise<string | null> {
  if (/https?:\/\/|discord\.gg|www\./i.test(bio)) return "Bios can't have links.";
  if (/@everyone|@here|<@[!&]?\d+>/.test(bio)) return "Bios can't mention people or roles.";
  const mod = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId, key: "MODERATION" } } });
  const cfg = (mod?.config ?? {}) as { bannedWordsEnabled?: boolean; bannedWords?: string[] };
  if (mod?.enabled && cfg.bannedWordsEnabled && cfg.bannedWords?.some((w) => w && bio.toLowerCase().includes(w.toLowerCase()))) return "That bio has a word this server's AutoMod blocks.";
  return null;
}

// A card asked for from the panel: only the clicker sees it, unless the
// server chose to show panel cards to everyone.
async function sendPanelCard(interaction: ButtonInteraction | UserSelectMenuInteraction, shownId: string) {
  const guild = interaction.guild as Guild;
  const user = await guild.client.users.fetch(shownId).catch(() => null);
  if (!user || user.bot) {
    const msg = { content: "Bots don't have profile cards. Pick a member.", components: [] };
    if (interaction.isUserSelectMenu()) await interaction.update(msg);
    else await interaction.reply({ ...msg, ephemeral: true });
    return;
  }
  const settings = await prisma.profileCardSettings.findUnique({ where: { guildId: guild.id } });
  const pub = settings?.panelPublic ?? false;
  const files = [new AttachmentBuilder(await renderProfile(guild, shownId), { name: "profile.png" })];
  if (interaction.isUserSelectMenu()) {
    if (pub) {
      await interaction.update({ content: `Posted <@${shownId}>'s card below.`, components: [], allowedMentions: { parse: [] } });
      await interaction.followUp({ content: `<@${interaction.user.id}> pulled up <@${shownId}>'s card`, files, components: [cardButtons(shownId)], allowedMentions: { parse: [] } });
    } else {
      await interaction.update({ content: "", files, components: [cardButtons(shownId)] });
    }
    return;
  }
  await interaction.editReply({ files, components: [cardButtons(shownId)] });
}

export async function handleProfileComponent(interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction | ModalSubmitInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  if (!(await isModuleEnabled(guild.id, "PROFILE_CARDS"))) {
    await interaction.reply({ content: "Profile Cards are turned off on this server.", ephemeral: true });
    return;
  }
  const userId = interaction.user.id;
  const id = interaction.customId;

  if (interaction.isButton() && id === "pcard:mine") {
    const settings = await prisma.profileCardSettings.findUnique({ where: { guildId: guild.id } });
    await interaction.deferReply({ ephemeral: !(settings?.panelPublic ?? false) });
    await sendPanelCard(interaction, userId);
    return;
  }
  if (interaction.isButton() && id === "pcard:pick") {
    await interaction.reply({
      content: "**🔍 Whose card?** Pick a member.",
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          new UserSelectMenuBuilder().setCustomId("pcard:who").setPlaceholder("Search for a member").setMinValues(1).setMaxValues(1)
        ),
      ],
      ephemeral: true,
    });
    return;
  }
  if (interaction.isUserSelectMenu() && id === "pcard:who") {
    await sendPanelCard(interaction, interaction.values[0]);
    return;
  }
  if (interaction.isButton() && id === "pcard:edit") {
    await interaction.reply({ ...(await editorView(guild, userId)), ephemeral: true });
    return;
  }
  if (interaction.isButton() && id.startsWith("pcard:cmp:")) {
    const shown = id.slice(10);
    if (shown === userId) {
      await interaction.reply({ content: "That's your own card. Use **/profile compare_with:** and pick someone.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const [a, b] = await Promise.all([renderProfile(guild, userId), renderProfile(guild, shown)]);
    await interaction.editReply({ files: [new AttachmentBuilder(await drawSideBySide(a, b), { name: "compare.png" })], components: [cardButtons(userId)] });
    return;
  }
  if (interaction.isButton() && id === "pcard:preview") {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ files: [new AttachmentBuilder(await renderProfile(guild, userId), { name: "preview.png" })] });
    return;
  }
  if (interaction.isButton() && id === "pcard:bio") {
    const card = await prisma.profileCard.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } });
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("pcard:biomodal")
        .setTitle("Your bio")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("bio")
              .setLabel(`A line about you (up to ${PROFILE_BIO_MAX} characters)`)
              .setStyle(TextInputStyle.Short)
              .setMaxLength(PROFILE_BIO_MAX)
              .setRequired(false)
              .setValue(card?.bio ?? "")
          )
        )
    );
    return;
  }
  if (interaction.isModalSubmit() && id === "pcard:biomodal") {
    const bio = interaction.fields.getTextInputValue("bio").replace(/\s+/g, " ").trim().slice(0, PROFILE_BIO_MAX);
    const problem = bio ? await bioProblem(guild.id, bio) : null;
    if (!problem) await saveCard(guild.id, userId, { bio: bio || null });
    const view = await editorView(guild, userId, problem ? `⚠️ ${problem} Your bio wasn't changed.` : bio ? "✅ Bio saved." : "✅ Bio removed.");
    if (interaction.isFromMessage()) await interaction.update(view);
    else await interaction.reply({ ...view, ephemeral: true });
    return;
  }
  if (interaction.isButton() && id.startsWith("pcard:buy:")) {
    const theme = PROFILE_THEMES.find((t) => t.id === id.slice(10) && t.cost);
    if (!theme?.cost) return;
    if (!(await isModuleEnabled(guild.id, "ECONOMY"))) {
      await interaction.update(await editorView(guild, userId, "⚠️ Coins are turned off on this server, so themes can't be bought."));
      return;
    }
    const card = await prisma.profileCard.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } });
    if (card?.unlockedThemes.includes(theme.id)) {
      await interaction.update(await editorView(guild, userId, `You already own ${theme.name}.`));
      return;
    }
    // Take the coins only if the balance covers it (one statement, so a double click can't spend twice).
    const paid = await prisma.economyBalance.updateMany({
      where: { guildId: guild.id, userId, balance: { gte: theme.cost } },
      data: { balance: { decrement: theme.cost }, totalSpent: { increment: theme.cost } },
    });
    if (paid.count === 0) {
      await interaction.update(await editorView(guild, userId, `⚠️ ${theme.name} costs ${num(theme.cost)} coins, and you don't have enough yet.`));
      return;
    }
    await saveCard(guild.id, userId, { unlockedThemes: [...(card?.unlockedThemes ?? []), theme.id], theme: theme.id });
    await interaction.update(await editorView(guild, userId, `🪙 Bought **${theme.name}** for ${num(theme.cost)} coins. It's on your card now.`));
    return;
  }
  if (interaction.isStringSelectMenu()) {
    const values = interaction.values;
    let note: string | undefined;
    if (id === "pcard:title" && (PROFILE_TITLES as readonly string[]).includes(values[0])) await saveCard(guild.id, userId, { title: values[0] });
    else if (id === "pcard:theme") {
      const t = themeFor(values[0]);
      const [xp, card] = await Promise.all([
        prisma.memberXp.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } }),
        prisma.profileCard.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } }),
      ]);
      if (themeUnlocked(t, xp?.level ?? 0, card?.unlockedThemes ?? [])) await saveCard(guild.id, userId, { theme: t.id });
      else note = t.cost ? `🔒 ${t.name} costs ${num(t.cost)} coins. Use the Buy button below.` : `🔒 ${t.name} unlocks at level ${t.unlockLevel}. You're level ${xp?.level ?? 0}.`;
    } else if (id === "pcard:badges") {
      const earned = await earnedBadges(guild.id, userId);
      await saveCard(guild.id, userId, { badges: values.filter((v) => earned.some((e) => e.type === v)).slice(0, MAX_PROFILE_BADGES) });
    } else if (id === "pcard:games") {
      await saveCard(guild.id, userId, { games: values.filter((v) => (PROFILE_GAMES as readonly string[]).includes(v)).slice(0, MAX_PROFILE_GAMES) });
    }
    await interaction.update(await editorView(guild, userId, note));
  }
}

