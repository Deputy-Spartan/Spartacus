import cron from "node-cron";
import { Client } from "discord.js";
import type { DailyPostConfig } from "@prisma/client";
import { logError } from "@spartacus/db";
import {
  DAILY_POST_LABELS,
  builtInDailyPosts,
  dailyPostTokenValues,
  defaultDailyPostMessage,
  parsePostTime,
  zonedClock,
  type DailyPostItem,
  type DailyPostKind,
} from "@spartacus/shared";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload, type SavedEmbedData } from "../lib/savedEmbedRender";

type Result = { ok: boolean; error?: string };

interface Pick {
  item: DailyPostItem;
  // Records the pick as used, so it isn't chosen again this time through.
  markUsed: () => Promise<void>;
}

// Chooses the next quote or question. Nothing repeats until every entry
// (the server's own, plus the built-in list when it's on) has had a turn.
async function pickItem(config: DailyPostConfig): Promise<Pick | null> {
  const kind = config.kind as DailyPostKind;
  const entries = await prisma.dailyPostEntry.findMany({ where: { guildId: config.guildId, kind }, orderBy: { createdAt: "asc" } });
  const builtIns = config.useBuiltIn ? builtInDailyPosts(kind) : [];
  if (entries.length === 0 && builtIns.length === 0) return null;

  const usedBuiltIn = new Set(Array.isArray(config.usedBuiltIn) ? (config.usedBuiltIn as number[]) : []);
  type Candidate = { entryId?: string; builtInIndex?: number; item: DailyPostItem };
  const all: Candidate[] = [
    ...entries.map((e) => ({ entryId: e.id, item: { text: e.text, author: e.author } })),
    ...builtIns.map((item, builtInIndex) => ({ builtInIndex, item })),
  ];
  const unused = all.filter((c) => (c.entryId ? !entries.find((e) => e.id === c.entryId)?.usedAt : !usedBuiltIn.has(c.builtInIndex!)));
  const startsOver = unused.length === 0;
  const pool = startsOver ? all : unused;
  const chosen = config.order === "IN_ORDER" ? pool[0] : pool[Math.floor(Math.random() * pool.length)];

  return {
    item: chosen.item,
    markUsed: async () => {
      if (startsOver) await prisma.dailyPostEntry.updateMany({ where: { guildId: config.guildId, kind }, data: { usedAt: null } });
      const nextUsedBuiltIn = startsOver ? [] : [...usedBuiltIn];
      if (chosen.builtInIndex !== undefined) nextUsedBuiltIn.push(chosen.builtInIndex);
      if (chosen.entryId) await prisma.dailyPostEntry.update({ where: { id: chosen.entryId }, data: { usedAt: new Date() } }).catch(() => null);
      await prisma.dailyPostConfig.update({ where: { id: config.id }, data: { usedBuiltIn: nextUsedBuiltIn, postCount: { increment: 1 } } });
    },
  };
}

// The one place a quote or question is sent, shared by the daily schedule
// and the dashboard's Send Test and Post Now buttons. A test doesn't use up
// the entry it shows or count toward the post number.
export async function postDailyPost(client: Client, config: DailyPostConfig, options: { isTest?: boolean } = {}): Promise<Result> {
  const kind = config.kind as DailyPostKind;
  const label = DAILY_POST_LABELS[kind] ?? "Daily post";
  if (!config.channelId) return { ok: false, error: "Pick a channel first." };

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "I can't post in that channel. Check that it still exists and that I can see it." };

  const pick = await pickItem(config);
  if (!pick) return { ok: false, error: kind === "QUOTE" ? "There are no quotes to post. Add one, or turn the built-in list on." : "There are no questions to post. Add one, or turn the built-in list on." };

  const clock = zonedClock(config.timeZone);
  const tokens = dailyPostTokenValues(kind, pick.item, {
    date: clock.longDate,
    number: config.postCount + 1,
    server: client.guilds.cache.get(config.guildId)?.name ?? "this server",
  });

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const data = saved ?? (config.creatorData as SavedEmbedData | null) ?? (defaultDailyPostMessage(kind) as SavedEmbedData);
  const payload = await buildSavedEmbedPayload(config.guildId, data, tokens);

  // A message with every box cleared would be rejected, so it still posts the text.
  const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
  let body = payload.content ?? "";
  if (!body && !hasEmbeds) body = kind === "QUOTE" ? `> ${pick.item.text}\n— ${tokens["{author}"]}` : pick.item.text;

  const prefix = options.isTest ? `🧪 **Test ${label}**, sent from the dashboard.` : "";
  const ping = config.pingRoleId ? `<@&${config.pingRoleId}>` : "";
  const content = [prefix, ping, body].filter(Boolean).join("\n").slice(0, 2000);

  const sent = await channel.send({ ...payload, content }).catch((err) => {
    logError("bot", err, config.guildId);
    return null;
  });
  if (!sent) return { ok: false, error: "Discord rejected the message. Check my permissions in that channel and the Discord Limits card." };

  if (!options.isTest) await pick.markUsed();

  if (config.createThread && "startThread" in sent && sent.channel.isTextBased() && !sent.channel.isThread() && !sent.channel.isDMBased()) {
    const name = `${label} · ${clock.longDate}`.slice(0, 100);
    await sent.startThread({ name, autoArchiveDuration: 1440 }).catch((err) => logError("bot", err, config.guildId));
  }

  return { ok: true };
}

// Dashboard buttons. Post Now counts as today's post, so the schedule won't
// send a second one later the same day.
export async function sendDailyPost(client: Client, guildId: string, kind: DailyPostKind, options: { isTest?: boolean } = {}): Promise<Result> {
  const config = await prisma.dailyPostConfig.findUnique({ where: { guildId_kind: { guildId, kind } } });
  if (!config) return { ok: false, error: "Pick a channel and save first." };

  const result = await postDailyPost(client, config, options);
  if (result.ok && !options.isTest) {
    await prisma.dailyPostConfig.update({ where: { id: config.id }, data: { lastPostedOn: zonedClock(config.timeZone).date } });
  }
  return result;
}

// Checks every minute. A feed is due once its clock passes the post time on
// a day it's set to run. Claiming the day in the database first means two
// bot instances overlapping during a deploy can't both post it.
export function startDailyPostsJob(client: Client) {
  cron.schedule("* * * * *", async () => {
    const configs = await prisma.dailyPostConfig.findMany({ where: { enabled: true, channelId: { not: null } }, take: 500 });

    for (const config of configs) {
      const clock = zonedClock(config.timeZone);
      if (config.lastPostedOn === clock.date) continue;
      if (clock.minutes < parsePostTime(config.postTime)) continue;
      const days = Array.isArray(config.days) ? (config.days as number[]) : [];
      if (!days.includes(clock.weekday)) continue;
      if (!(await isModuleEnabled(config.guildId, "QOTD"))) continue;

      const claimed = await prisma.dailyPostConfig.updateMany({
        where: { id: config.id, OR: [{ lastPostedOn: null }, { lastPostedOn: { not: clock.date } }] },
        data: { lastPostedOn: clock.date },
      });
      if (claimed.count === 0) continue;

      const result = await postDailyPost(client, config).catch((err) => {
        logError("bot", err, config.guildId);
        return { ok: false } as Result;
      });
      if (!result.ok) console.warn(`[dailyPosts] ${config.kind} for ${config.guildId} didn't post: ${result.error ?? "unknown error"}`);
    }
  });
}
