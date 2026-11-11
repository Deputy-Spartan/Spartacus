import type { Client } from "discord.js";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { addBalance, getConfig } from "../../lib/economy";
import { awardXp } from "../leveling/xp";
import { handleLevelUp } from "../leveling/levelUp";
import { chattersSince, setChatChannels } from "./twitchChat";

// Viewer rewards: a member who linked their Twitch name earns coins and XP
// for chatting in a followed streamer's live chat. Paid once per interval,
// with a daily coin cap so it can't be farmed.

const lastPaid = new Map<string, number>(); // guildId:userId -> when
const TICK_MS = 5 * 60_000;

// Which live Twitch channels to listen to, across every server that has
// rewards on. Called after each live check and on each rewards tick.
export async function syncChatChannels() {
  const configs = await prisma.streamExtrasConfig.findMany({ where: { rewardsEnabled: true }, select: { guildId: true } });
  const guilds: string[] = [];
  for (const c of configs) if (await isModuleEnabled(c.guildId, "STREAM_EXTRAS")) guilds.push(c.guildId);
  if (!guilds.length) return setChatChannels([]);
  const live = await prisma.streamSubscription.findMany({ where: { guildId: { in: guilds }, platform: "twitch", isLive: true }, select: { channelName: true } });
  setChatChannels([...new Set(live.map((s) => s.channelName.toLowerCase()))]);
}

export async function rewardTick(client: Client) {
  await syncChatChannels();
  const configs = await prisma.streamExtrasConfig.findMany({ where: { rewardsEnabled: true } });
  const day = new Date().toISOString().slice(0, 10);
  for (const config of configs) {
    try {
      const guild = client.guilds.cache.get(config.guildId);
      if (!guild || !(await isModuleEnabled(config.guildId, "STREAM_EXTRAS"))) continue;
      const live = await prisma.streamSubscription.findMany({ where: { guildId: config.guildId, platform: "twitch", isLive: true }, select: { channelName: true } });
      if (!live.length) continue;
      // Who wrote in a live chat since the last tick (never the streamer in their own chat).
      const chatters = new Set<string>();
      for (const s of live) {
        const login = s.channelName.toLowerCase();
        for (const u of chattersSince(login, TICK_MS + 30_000)) if (u !== login) chatters.add(u);
      }
      if (!chatters.size) continue;
      const links = await prisma.streamLink.findMany({ where: { guildId: config.guildId, verified: true, platform: "twitch", handle: { in: [...chatters] } } });
      if (!links.length) continue;
      const [coinsOn, levelsOn] = await Promise.all([isModuleEnabled(config.guildId, "ECONOMY"), isModuleEnabled(config.guildId, "LEVELING")]);
      const economy = coinsOn && config.rewardCoins > 0 ? await getConfig(config.guildId) : null;
      for (const link of links) {
        const key = `${config.guildId}:${link.userId}`;
        if (Date.now() - (lastPaid.get(key) ?? 0) < config.rewardIntervalMin * 60_000 - 10_000) continue;
        lastPaid.set(key, Date.now());
        if (economy) {
          const today = await prisma.streamRewardDay.findUnique({ where: { guildId_userId_day: { guildId: config.guildId, userId: link.userId, day } } });
          const room = Math.max(0, config.rewardDailyCoinCap - (today?.coins ?? 0));
          const coins = Math.min(config.rewardCoins, room);
          if (coins > 0) {
            await addBalance(config.guildId, link.userId, coins, "stream chat", economy.maxBalance);
            await prisma.streamRewardDay.upsert({
              where: { guildId_userId_day: { guildId: config.guildId, userId: link.userId, day } },
              create: { guildId: config.guildId, userId: link.userId, day, coins },
              update: { coins: { increment: coins } },
            });
          }
        }
        if (levelsOn && config.rewardXp > 0) {
          const r = await awardXp(config.guildId, link.userId, config.rewardXp);
          if (r.leveledUp) await handleLevelUp(client, guild, link.userId, r.from, r.level, null).catch((e) => logError("bot", e, config.guildId));
        }
      }
      // Old daily rows aren't needed.
      if (Math.random() < 0.02) await prisma.streamRewardDay.deleteMany({ where: { day: { lt: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10) } } });
    } catch (err) {
      logError("bot", err, config.guildId);
    }
  }
}
