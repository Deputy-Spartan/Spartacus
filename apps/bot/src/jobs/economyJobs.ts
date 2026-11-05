import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, type Client, type Guild } from "discord.js";
import { CHAMP_CATEGORIES, activeEvent, weekKey, localParts, type ChampCategory } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { isSendableChannel } from "../lib/channels";
import { addBalance, getConfig } from "../lib/economy";
import { addWeekly, economyPlus, giveCrates } from "../lib/economyPlus";
import { awardXp } from "../modules/leveling/xp";
import { handleLevelUp } from "../modules/leveling/levelUp";

// ---- Voice XP: every minute, people talking in voice with at least one
// other person earn XP; coins every 10 such minutes. Alone, muted, deafened
// or in the AFK channel earns nothing, so it can't be farmed.
const voiceMinutes = new Map<string, number>();
async function voiceTick(client: Client) {
  const rows = await prisma.economyPlus.findMany({ where: { voiceXpEnabled: true }, select: { guildId: true } }).catch(() => []);
  for (const { guildId } of rows) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const [levelsOn, coinsOn, plus] = await Promise.all([isModuleEnabled(guildId, "LEVELING"), isModuleEnabled(guildId, "ECONOMY"), economyPlus(guildId)]);
    if (!levelsOn && !coinsOn) continue;
    const config = coinsOn ? await getConfig(guildId) : null;
    for (const ch of guild.channels.cache.values()) {
      if ((ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildStageVoice) || ch.id === guild.afkChannelId) continue;
      const humans = [...ch.members.values()].filter((m) => !m.user.bot);
      if (humans.length < 2) continue;
      for (const m of humans) {
      const v = m.voice;
        if (v.selfMute || v.serverMute || v.selfDeaf || v.serverDeaf) continue;
        void addWeekly(guildId, m.id, { voiceMin: 1 });
        if (levelsOn) {
          const r = await awardXp(guildId, m.id, plus.voiceXpPerMin).catch(() => null);
          if (r?.leveledUp) await handleLevelUp(client, guild, m.id, r.from, r.level, ch.id).catch((e) => logError("bot", e, guildId));
        }
        if (coinsOn && config && plus.voiceCoinsPer10 > 0) {
          const key = `${guildId}:${m.id}`;
          const n = (voiceMinutes.get(key) ?? 0) + 1;
          voiceMinutes.set(key, n % 10);
          if (n >= 10) await addBalance(guildId, m.id, plus.voiceCoinsPer10, "voice", config.maxBalance).catch(() => null);
        }
      }
    }
  }
}

// ---- XP Events: announce when a Double XP Weekend or Happy Hour starts and ends.
async function eventTick(client: Client) {
  const rows = await prisma.economyPlus.findMany({ where: { OR: [{ weekendEnabled: true }, { happyEnabled: true }, { eventState: { not: null } }] } }).catch(() => []);
  for (const row of rows) {
    const plus = await economyPlus(row.guildId);
    const ev = activeEvent(plus);
    const state = ev ? ev.kind : null;
    if (state === (row.eventState ?? null)) continue;
    await prisma.economyPlus.update({ where: { guildId: row.guildId }, data: { eventState: state } }).catch(() => null);
    if (!plus.eventChannelId) continue;
    const guild = client.guilds.cache.get(row.guildId);
    const ch = guild ? await guild.channels.fetch(plus.eventChannelId).catch(() => null) : null;
    if (!ch || !isSendableChannel(ch)) continue;
    let embed: EmbedBuilder;
    if (ev?.kind === "weekend") embed = new EmbedBuilder().setColor(0x5fd39a).setTitle(`🎉 ${ev.mult}x XP Weekend is ON!`).setDescription(`Every message and every minute in voice earns **${ev.mult}x XP and coins** until Sunday at midnight. Go get those levels!`);
    else if (ev?.kind === "happy") embed = new EmbedBuilder().setColor(0xf2c94c).setTitle(`⏰ Happy Hour: ${ev.mult}x XP and coins`).setDescription("For the next hour, everything earns more. Jump in!");
    else embed = new EmbedBuilder().setColor(0x95a5a6).setTitle(row.eventState === "weekend" ? "The XP Weekend is over" : "Happy Hour is over").setDescription("Thanks for playing! XP is back to normal.");
    await ch.send({ embeds: [embed] }).catch(() => null);
  }
}

// ---- Weekly Champions: Monday at noon (server time), for last week.
async function champsTick(client: Client) {
  const rows = await prisma.economyPlus.findMany({ where: { champsEnabled: true } }).catch(() => []);
  for (const row of rows) {
    const p = localParts(row.timezone);
    if (p.weekday !== 1 || p.hour < 12) continue;
    const thisWeek = weekKey(row.timezone);
    if (row.lastChampsWeek === thisWeek) continue;
    // Claim the week first so it's only ever posted once.
    const claimed = await prisma.economyPlus.updateMany({ where: { guildId: row.guildId, OR: [{ lastChampsWeek: null }, { lastChampsWeek: { not: thisWeek } }] }, data: { lastChampsWeek: thisWeek } });
    if (!claimed.count) continue;
    const guild = client.guilds.cache.get(row.guildId);
    if (guild) await postChampions(guild, row, thisWeek).catch((e) => logError("bot", e, row.guildId));
  }
}

async function postChampions(guild: Guild, row: { guildId: string; timezone: string; champsChannelId: string | null; champsRoleId: string | null; champsCategories: string[]; cratesEnabled: boolean }, thisWeek: string) {
  const lastWeekDate = new Date(Date.now() - 7 * 86_400_000);
  const lastWeek = weekKey(row.timezone, lastWeekDate);
  const cats = row.champsCategories.filter((c): c is ChampCategory => c in CHAMP_CATEGORIES);
  const winners: Array<{ cat: ChampCategory; userId: string; value: string }> = [];
  const cfg = await getConfig(guild.id);
  for (const cat of cats) {
    if (cat === "xp" || cat === "voice") {
      const top = await prisma.weeklyStat.findFirst({ where: { guildId: guild.id, week: lastWeek, [cat === "xp" ? "xp" : "voiceMin"]: { gt: 0 } }, orderBy: cat === "xp" ? { xp: "desc" } : { voiceMin: "desc" } });
      if (top) winners.push({ cat, userId: top.userId, value: cat === "xp" ? `${top.xp.toLocaleString("en-US")} XP` : `${Math.floor(top.voiceMin / 60)}h ${top.voiceMin % 60}m` });
    } else if (cat === "coins") {
      const since = new Date(Date.now() - 7 * 86_400_000);
      const sums = await prisma.economyTransaction.groupBy({
        by: ["userId"],
        where: { guildId: guild.id, createdAt: { gte: since }, amount: { gt: 0 }, reason: { notIn: ["transfer_in", "admin"] } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 1,
      });
      if (sums[0]?._sum.amount) winners.push({ cat, userId: sums[0].userId, value: `${cfg.currencyIcon} ${sums[0]._sum.amount.toLocaleString("en-US")}` });
    } else if (cat === "streak") {
      const top = await prisma.economyBalance.findFirst({ where: { guildId: guild.id, dailyStreak: { gt: 0 } }, orderBy: { dailyStreak: "desc" } });
      if (top) winners.push({ cat, userId: top.userId, value: `${top.dailyStreak} days` });
    }
  }
  if (!winners.length) return;

  // The champion role moves to this week's winners.
  if (row.champsRoleId) {
    const role = await guild.roles.fetch(row.champsRoleId).catch(() => null);
    if (role) {
      await guild.members.fetch().catch(() => null);
      for (const m of role.members.values()) if (!winners.some((w) => w.userId === m.id)) await m.roles.remove(role, "Weekly Champions: new week").catch(() => null);
      for (const w of winners) {
        const m = await guild.members.fetch(w.userId).catch(() => null);
        await m?.roles.add(role, "Weekly Champion").catch(() => null);
      }
    }
  }
  const crates = row.cratesEnabled && (await isModuleEnabled(guild.id, "ECONOMY"));
  if (crates) for (const w of new Set(winners.map((x) => x.userId))) await giveCrates(guild.id, w, "rare");

  if (!row.champsChannelId) return;
  const ch = await guild.channels.fetch(row.champsChannelId).catch(() => null);
  if (!ch || !isSendableChannel(ch)) return;
  const prizes = [row.champsRoleId ? `<@&${row.champsRoleId}> for the week` : null, crates ? "a 🎁 Rare Crate" : null].filter(Boolean).join(" and ");
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Last week's champions")
    .setDescription(
      [winners.map((w) => `${CHAMP_CATEGORIES[w.cat]}: <@${w.userId}> (${w.value})`).join("\n"), prizes ? `\nEach champion gets ${prizes}.` : "", `\n-# A new week started. Week of ${thisWeek}.`].join("\n")
    );
  await ch.send({ embeds: [embed], allowedMentions: { users: winners.map((w) => w.userId) } }).catch(() => null);
}

// ---- Shop roles that were bought for a number of days come off when time's up.
async function expireRoles(client: Client) {
  const due = await prisma.economyTimedRole.findMany({ where: { expiresAt: { lte: new Date() } }, take: 100 }).catch(() => []);
  for (const t of due) {
    await prisma.economyTimedRole.delete({ where: { id: t.id } }).catch(() => null);
    const guild = client.guilds.cache.get(t.guildId);
    const member = guild ? await guild.members.fetch(t.userId).catch(() => null) : null;
    await member?.roles.remove(t.roleId, "Shop item ran out").catch(() => null);
  }
}

// ---- The shop panel: an embed with Shop / My crates / Daily / Balance buttons.
export async function postShopPanel(client: Client, guildId: string): Promise<string | null> {
  const row = await prisma.economyPlus.findUnique({ where: { guildId } });
  if (!row?.shopPanelChannelId || row.shopPanelMessageId) return null;
  if (!(await isModuleEnabled(guildId, "ECONOMY"))) return "Turn on the Economy module first.";
  const ch = await client.channels.fetch(row.shopPanelChannelId).catch(() => null);
  if (!isSendableChannel(ch)) return "Spartacus can't post in that channel.";
  const cfg = await getConfig(guildId);
  const embed = new EmbedBuilder()
    .setColor((cfg.embedColor as `#${string}`) || 0xe8c547)
    .setTitle(row.shopPanelTitle || `🛒 ${cfg.currencyName} Shop`)
    .setDescription(
      row.shopPanelText ||
        `Spend your ${cfg.currencyIcon} ${cfg.currencyName} on rewards, open loot crates, and claim your daily bonus. Everything opens just for you.\n\n🛒 **Shop**: see what's for sale and buy it\n🎁 **My Crates**: open your loot crates\n📅 **Daily**: claim today's ${cfg.currencyName}\n💰 **Balance**: your ${cfg.currencyName}, streak and potions`
    );
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("eshop:panel:shop").setLabel("Shop").setEmoji("🛒").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("eshop:panel:crates").setLabel("My Crates").setEmoji("🎁").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("eshop:panel:daily").setLabel("Daily").setEmoji("📅").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("eshop:panel:balance").setLabel("Balance").setEmoji("💰").setStyle(ButtonStyle.Secondary)
  );
  const msg = await ch.send({ embeds: [embed], components: [buttons] }).catch((e) => {
    logError("bot", e, guildId);
    return null;
  });
  if (!msg) return "Discord refused the panel. Check Spartacus can send messages and embeds there.";
  const saved = await prisma.economyPlus.updateMany({ where: { guildId, shopPanelChannelId: row.shopPanelChannelId, shopPanelMessageId: null }, data: { shopPanelMessageId: msg.id } });
  if (!saved.count) await msg.delete().catch(() => null);
  return null;
}

export function startEconomyJobs(client: Client) {
  cron.schedule("* * * * *", async () => {
    await voiceTick(client).catch((e) => logError("bot", e));
    await eventTick(client).catch((e) => logError("bot", e));
    await expireRoles(client).catch(() => null);
    const pending = await prisma.economyPlus.findMany({ where: { shopPanelChannelId: { not: null }, shopPanelMessageId: null }, select: { guildId: true }, take: 20 }).catch(() => []);
    for (const p of pending) await postShopPanel(client, p.guildId).catch(() => null);
  });
  cron.schedule("*/10 * * * *", () => void champsTick(client).catch((e) => logError("bot", e)));
}
