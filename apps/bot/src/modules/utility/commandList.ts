import { EmbedBuilder, type BaseMessageOptions, type Client, type Guild } from "discord.js";
import { createHash } from "node:crypto";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { commands } from "../../commands";

// The command list: every Spartacus command (and the server's own), posted in a
// channel with one post per category, as an embed or a plain message. Each
// command is a Discord command mention, so tapping it (on PC or phone) puts the
// command straight into the message box. Staff commands can go to their own
// staff-only channel. Posts are edited in place: adding or removing a command
// edits just that category's post.

const CATEGORIES: Array<{ emoji: string; name: string; color: number; names: string[] }> = [
  { emoji: "🛡️", name: "Moderation & safety", color: 0xc0504d, names: ["ban", "kick", "mute", "warn", "purge", "purge-user", "quarantine", "release", "report", "verify"] },
  { emoji: "👋", name: "Community", color: 0x4f9d69, names: ["birthday", "confess", "suggest", "approve-suggestion", "deny-suggestion", "role", "sticky", "remindme", "server-setup"] },
  { emoji: "🔴", name: "Streaming", color: 0x9146ff, names: ["golive", "mystream", "schedule", "link", "prestream", "so", "title", "raidlist", "gamenight"] },
  { emoji: "💰", name: "Economy & levels", color: 0xe8c547, names: ["balance", "daily", "pay", "shop", "crates", "rank", "profile", "leaderboard", "prestige", "levelroles"] },
  { emoji: "🎮", name: "Games & fun", color: 0x3ba7d9, names: ["trivia", "coinflip", "slots", "match"] },
  { emoji: "⚔️", name: "Events & giveaways", color: 0xd9822b, names: ["event", "giveaway-reroll"] },
];
const OTHER = { emoji: "🧰", name: "More", color: 0x7b99bc, names: [] as string[] };
const CUSTOM = { emoji: "⭐", name: "This server's commands", color: 0xf0c46a, names: [] as string[] };
const ORDER = [...CATEGORIES.map((c) => c.name), OTHER.name, CUSTOM.name];

interface Entry {
  mention: string;
  description: string;
  staff: boolean;
}
export interface CommandGroup {
  emoji: string;
  name: string;
  color: number;
  entries: Entry[];
}
// Which commands a list shows.
export type ListAudience = "everyone" | "staff";
export interface CommandListOptions {
  includeStaff: boolean;
  includeCustom: boolean;
  onlyEnabled: boolean;
  staffChannelId?: string | null;
}

// The ids Discord gave each command, so they can be mentioned (and tapped).
async function commandIds(client: Client, guild: Guild): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const global = await client.application?.commands.fetch().catch(() => null);
  global?.forEach((c) => ids.set(c.name, c.id));
  const local = await guild.commands.fetch().catch(() => null);
  local?.forEach((c) => ids.set(c.name, c.id));
  return ids;
}

const looksStaff = (d: string) => /^(staff|admins?)\b[:\s]/i.test(d) || /\((staff|admins?)\)$/i.test(d);
const cleanDesc = (d: string) => d.replace(/^(staff|admins?):\s*/i, "").replace(/\s*\((staff|admins?)\)$/i, "");

// Every command, grouped by category, for one list. With a staff channel, the
// main list leaves staff commands out and the staff list has only them.
export async function buildCommandList(client: Client, guild: Guild, opts: CommandListOptions, audience: ListAudience = "everyone"): Promise<CommandGroup[]> {
  const ids = await commandIds(client, guild);
  const separate = !!opts.staffChannelId;
  const wanted = (staff: boolean) => (audience === "staff" ? staff : staff ? opts.includeStaff && !separate : true);
  const mention = (full: string, top: string) => (ids.get(top) ? `</${full}:${ids.get(top)}>` : `\`/${full}\``);
  const groups = new Map<string, CommandGroup>();
  const add = (cat: { emoji: string; name: string; color: number }, e: Entry) => {
    if (!wanted(e.staff)) return;
    const g = groups.get(cat.name) ?? { emoji: cat.emoji, name: cat.name, color: cat.color, entries: [] };
    g.entries.push(e);
    groups.set(cat.name, g);
  };
  for (const cmd of commands.values()) {
    const json = cmd.data.toJSON();
    if (opts.onlyEnabled && cmd.moduleKey && !(await isModuleEnabled(guild.id, cmd.moduleKey))) continue;
    const cmdStaff = json.default_member_permissions != null;
    const cat = CATEGORIES.find((c) => c.names.includes(json.name)) ?? OTHER;
    const subs = (json.options ?? []).filter((o) => o.type === 1) as Array<{ name: string; description: string }>;
    if (!subs.length) {
      add(cat, { mention: mention(json.name, json.name), description: json.description, staff: cmdStaff });
      continue;
    }
    for (const s of subs) add(cat, { mention: mention(`${json.name} ${s.name}`, json.name), description: cleanDesc(s.description), staff: cmdStaff || looksStaff(s.description) });
  }
  if (opts.includeCustom && (await isModuleEnabled(guild.id, "CUSTOM_COMMANDS"))) {
    const [slash, triggers] = await Promise.all([
      prisma.customSlashCommand.findMany({ where: { guildId: guild.id, enabled: true }, orderBy: { name: "asc" } }),
      prisma.customCommand.findMany({ where: { guildId: guild.id }, orderBy: { trigger: "asc" } }),
    ]);
    for (const c of slash) add(CUSTOM, { mention: c.discordCommandId ? `</${c.name}:${c.discordCommandId}>` : `\`/${c.name}\``, description: c.description, staff: c.access === "MODS" || c.access === "ADMINS" });
    for (const t of triggers) add(CUSTOM, { mention: `\`!${t.trigger}\``, description: "Type it in chat", staff: false });
  }
  return [...groups.values()].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
}

const lineOf = (e: Entry, markStaff: boolean) => `${e.mention} — ${e.description}${markStaff && e.staff ? " · `STAFF`" : ""}`;

// One post per category (a long category takes more than one), each with a key
// so it can be edited on its own later.
export function commandListPosts(groups: CommandGroup[], style: string, audience: ListAudience = "everyone"): Array<{ key: string; payload: BaseMessageOptions }> {
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const header = audience === "staff" ? `**🔒 Staff commands** · only staff can see this channel · ${total} command${total === 1 ? "" : "s"}` : `**📜 Spartacus commands** · tap one to put it in your message box · ${total} command${total === 1 ? "" : "s"}`;
  const markStaff = audience === "everyone";
  const posts: Array<{ key: string; payload: BaseMessageOptions }> = [];
  groups.forEach((g, gi) => {
    // Split a category's lines into chunks that fit one embed description (4,096) or message (2,000).
    const max = style === "PLAIN" ? 1800 : 3900;
    const chunks: string[][] = [[]];
    let size = 0;
    for (const e of g.entries) {
      const line = style === "PLAIN" ? `- ${lineOf(e, markStaff)}` : lineOf(e, markStaff);
      if (size + line.length + 1 > max && chunks[chunks.length - 1].length) {
        chunks.push([]);
        size = 0;
      }
      chunks[chunks.length - 1].push(line);
      size += line.length + 1;
    }
    chunks.forEach((lines, ci) => {
      const key = `${g.name}${ci ? `#${ci + 1}` : ""}`;
      const intro = gi === 0 && ci === 0 ? header : undefined;
      const title = `${g.emoji} ${g.name}${ci ? " (more)" : ""}`;
      if (style === "PLAIN") {
        posts.push({ key, payload: { content: [intro ? `${intro}\n` : "", `### ${title}`, ...lines].filter(Boolean).join("\n"), allowedMentions: { parse: [] } } });
      } else {
        const embed = new EmbedBuilder()
          .setColor(g.color)
          .setTitle(title)
          .setDescription(lines.join("\n"))
          .setFooter({ text: `${g.entries.length} command${g.entries.length === 1 ? "" : "s"} · updates by itself` });
        posts.push({ key, payload: { content: intro, embeds: [embed], allowedMentions: { parse: [] } } });
      }
    });
  });
  if (!posts.length) {
    posts.push({ key: "empty", payload: { content: `${header}\n-# Nothing to show yet.`, allowedMentions: { parse: [] } } });
  }
  return posts;
}

interface Posted {
  key: string;
  id: string;
  hash: string;
}
// Lists posted before the one-post-per-category layout stored bare message ids;
// those still count, so the old posts are cleared when the new ones go up.
const postedList = (v: unknown): Posted[] =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? { key: "old", id: x, hash: "" } : x))
        .filter((x): x is Posted => !!x && typeof x === "object" && typeof (x as Posted).id === "string" && typeof (x as Posted).key === "string")
    : [];
const hashOf = (p: BaseMessageOptions) => createHash("sha1").update(JSON.stringify([p.content ?? "", (p.embeds ?? []).map((e) => (e as EmbedBuilder).toJSON())])).digest("hex");

// Keeps one channel's posts matching `posts`: only the posts that changed are
// edited. When categories are added or removed (so the order changes), the
// posts are cleared and posted fresh, top to bottom.
export async function syncChannel(client: Client, guildId: string, channelId: string, posts: Array<{ key: string; payload: BaseMessageOptions }>, before: Posted[], force: boolean): Promise<{ ok: boolean; posted: Posted[]; error?: string }> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!isSendableChannel(channel) || !("messages" in channel)) return { ok: false, posted: before, error: "Spartacus can't post in that channel." };
  const sameLayout = before.length === posts.length && before.every((p, i) => p.key === posts[i].key);
  if (sameLayout) {
    const out: Posted[] = [];
    let ok = true;
    for (let i = 0; i < posts.length; i++) {
      const hash = hashOf(posts[i].payload);
      if (!force && hash === before[i].hash) {
        out.push(before[i]);
        continue;
      }
      const msg = await channel.messages.fetch(before[i].id).catch(() => null);
      const edited = msg ? await msg.edit({ content: posts[i].payload.content ?? "", embeds: posts[i].payload.embeds ?? [] }).then(() => true).catch(() => false) : false;
      if (!edited) {
        ok = false;
        break;
      }
      out.push({ key: posts[i].key, id: before[i].id, hash });
    }
    if (ok) return { ok: true, posted: out };
  }
  for (const p of before) {
    const old = await channel.messages.fetch(p.id).catch(() => null);
    await old?.delete().catch(() => null);
  }
  const posted: Posted[] = [];
  for (const p of posts) {
    const msg = await channel.send(p.payload).catch((err) => {
      logError("bot", err, guildId);
      return null;
    });
    if (!msg) return { ok: false, posted, error: "Discord wouldn't take the post. Check Spartacus can send messages and embeds there." };
    posted.push({ key: p.key, id: msg.id, hash: hashOf(p.payload) });
  }
  return { ok: true, posted };
}

// Posts both lists (everyone's, and staff's when a staff channel is set), or
// edits whatever changed.
export async function refreshCommandList(client: Client, guildId: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const settings = await prisma.commandListSettings.findUnique({ where: { guildId } });
  if (!settings?.channelId && !settings?.staffChannelId) return { ok: false, error: "Pick a channel for the list first." };
  if (!force && !settings.autoUpdate) return { ok: true };
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, error: "Spartacus isn't in that server." };
  let error: string | undefined;
  const data: { messageIds?: Posted[]; staffMessageIds?: Posted[] } = {};
  if (settings.channelId) {
    const posts = commandListPosts(await buildCommandList(client, guild, settings, "everyone"), settings.style, "everyone");
    const r = await syncChannel(client, guildId, settings.channelId, posts, postedList(settings.messageIds), force);
    data.messageIds = r.posted;
    if (!r.ok) error = r.error;
  }
  if (settings.staffChannelId) {
    const posts = commandListPosts(await buildCommandList(client, guild, settings, "staff"), settings.style, "staff");
    const r = await syncChannel(client, guildId, settings.staffChannelId, posts, postedList(settings.staffMessageIds), force);
    data.staffMessageIds = r.posted;
    if (!r.ok) error ??= r.error;
  }
  await prisma.commandListSettings.update({ where: { guildId }, data: data as never });
  return error ? { ok: false, error } : { ok: true };
}

// Every few minutes: lists set to update by themselves catch any new, changed or removed command.
export async function commandListTick(client: Client) {
  const rows = await prisma.commandListSettings.findMany({ where: { autoUpdate: true, OR: [{ channelId: { not: null } }, { staffChannelId: { not: null } }] }, select: { guildId: true } });
  for (const r of rows) {
    if (!client.guilds.cache.has(r.guildId)) continue;
    await refreshCommandList(client, r.guildId).catch((err) => logError("bot", err, r.guildId));
  }
}
