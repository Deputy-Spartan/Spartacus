import { EmbedBuilder, type BaseMessageOptions, type Client, type Guild } from "discord.js";
import { createHash } from "node:crypto";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { commands } from "../../commands";

// The command list: every Spartacus command (and the server's own), posted in a
// channel as an embed or plain messages and edited in place when commands
// change. Each command is a Discord command mention, so tapping it (on PC or
// phone) puts the command straight into the message box.

const CATEGORIES: Array<{ emoji: string; name: string; names: string[] }> = [
  { emoji: "🛡️", name: "Moderation & safety", names: ["ban", "kick", "mute", "warn", "purge", "purge-user", "quarantine", "release", "report", "verify"] },
  { emoji: "👋", name: "Community", names: ["birthday", "confess", "suggest", "approve-suggestion", "deny-suggestion", "role", "sticky", "remindme", "server-setup"] },
  { emoji: "🔴", name: "Streaming", names: ["golive", "mystream", "schedule", "link", "prestream", "so", "title", "raidlist", "gamenight"] },
  { emoji: "💰", name: "Economy & levels", names: ["balance", "daily", "pay", "shop", "crates", "rank", "profile", "leaderboard", "prestige", "levelroles"] },
  { emoji: "🎮", name: "Games & fun", names: ["trivia", "coinflip", "slots", "match"] },
  { emoji: "⚔️", name: "Events & giveaways", names: ["event", "giveaway-reroll"] },
];
const OTHER = { emoji: "🧰", name: "More", names: [] as string[] };
const CUSTOM = { emoji: "⭐", name: "This server's commands", names: [] as string[] };

interface Entry {
  mention: string;
  description: string;
  staff: boolean;
}
export interface CommandListOptions {
  includeStaff: boolean;
  includeCustom: boolean;
  onlyEnabled: boolean;
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

// Every command, grouped, as lines ready to post.
export async function buildCommandList(client: Client, guild: Guild, opts: CommandListOptions) {
  const ids = await commandIds(client, guild);
  const mention = (full: string, top: string) => (ids.get(top) ? `</${full}:${ids.get(top)}>` : `\`/${full}\``);
  const groups = new Map<string, { emoji: string; name: string; entries: Entry[] }>();
  const add = (cat: { emoji: string; name: string }, e: Entry) => {
    const g = groups.get(cat.name) ?? { emoji: cat.emoji, name: cat.name, entries: [] };
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
      if (cmdStaff && !opts.includeStaff) continue;
      add(cat, { mention: mention(json.name, json.name), description: json.description, staff: cmdStaff });
      continue;
    }
    for (const s of subs) {
      const staff = cmdStaff || looksStaff(s.description);
      if (staff && !opts.includeStaff) continue;
      add(cat, { mention: mention(`${json.name} ${s.name}`, json.name), description: cleanDesc(s.description), staff });
    }
  }
  if (opts.includeCustom && (await isModuleEnabled(guild.id, "CUSTOM_COMMANDS"))) {
    const [slash, triggers] = await Promise.all([
      prisma.customSlashCommand.findMany({ where: { guildId: guild.id, enabled: true }, orderBy: { name: "asc" } }),
      prisma.customCommand.findMany({ where: { guildId: guild.id }, orderBy: { trigger: "asc" } }),
    ]);
    for (const c of slash) {
      const staff = c.access === "MODS" || c.access === "ADMINS";
      if (staff && !opts.includeStaff) continue;
      add(CUSTOM, { mention: c.discordCommandId ? `</${c.name}:${c.discordCommandId}>` : `\`/${c.name}\``, description: c.description, staff });
    }
    for (const t of triggers) add(CUSTOM, { mention: `\`!${t.trigger}\``, description: "Type it in chat", staff: false });
  }
  const order = [...CATEGORIES.map((c) => c.name), OTHER.name, CUSTOM.name];
  return [...groups.values()].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

const lineOf = (e: Entry) => `${e.mention} — ${e.description}${e.staff ? " · `STAFF`" : ""}`;

// The posts: one or more embeds (each under Discord's limits), or plain messages under 2,000 characters.
export function commandListPayloads(groups: Awaited<ReturnType<typeof buildCommandList>>, style: string): BaseMessageOptions[] {
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const intro = `Tap a command to put it in your message box. ${total} command${total === 1 ? "" : "s"}.`;
  if (style === "PLAIN") {
    const messages: string[] = [];
    let cur = `## 📜 Spartacus commands\n-# ${intro}\n`;
    for (const g of groups) {
      const block = [`### ${g.emoji} ${g.name}`, ...g.entries.map((e) => `- ${lineOf(e)}`)];
      for (const line of block) {
        if (cur.length + line.length + 1 > 1950) {
          messages.push(cur);
          cur = "";
        }
        cur += (cur ? "\n" : "") + line;
      }
    }
    messages.push(`${cur}\n-# Updates by itself when commands change`);
    return messages.map((content) => ({ content, allowedMentions: { parse: [] } }));
  }
  // Embeds: each category's lines become fields of up to 1,024 characters.
  const fields: Array<{ name: string; value: string }> = [];
  for (const g of groups) {
    let value = "";
    let first = true;
    for (const e of g.entries) {
      const line = lineOf(e);
      if (value.length + line.length + 1 > 1000) {
        fields.push({ name: first ? `${g.emoji} ${g.name}` : "​", value });
        first = false;
        value = "";
      }
      value += (value ? "\n" : "") + line;
    }
    if (value) fields.push({ name: first ? `${g.emoji} ${g.name}` : "​", value: value + "\n​" });
  }
  // A message's embeds can hold 6,000 characters in all, so a very long list goes over more than one message.
  const messages: EmbedBuilder[][] = [[]];
  let size = 0;
  let embed = new EmbedBuilder().setColor(0x7b99bc).setTitle("📜 Spartacus commands").setDescription(intro);
  size = 60 + intro.length;
  for (const f of fields) {
    const len = f.name.length + f.value.length;
    if ((embed.data.fields?.length ?? 0) >= 25 || size + len > 5500) {
      messages[messages.length - 1].push(embed);
      messages.push([]);
      embed = new EmbedBuilder().setColor(0x7b99bc);
      size = 0;
    }
    embed.addFields(f);
    size += len;
  }
  embed.setFooter({ text: "Updates by itself when commands change" });
  messages[messages.length - 1].push(embed);
  return messages.filter((m) => m.length).map((embeds) => ({ embeds, allowedMentions: { parse: [] } }));
}

const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// Posts the list, or edits the posted messages in place when it changed. It's
// only reposted when the number of messages changes or one was deleted.
export async function refreshCommandList(client: Client, guildId: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const settings = await prisma.commandListSettings.findUnique({ where: { guildId } });
  if (!settings?.channelId) return { ok: false, error: "Pick a channel for the list first." };
  if (!force && !settings.autoUpdate) return { ok: true };
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, error: "Spartacus isn't in that server." };
  const groups = await buildCommandList(client, guild, settings);
  const payloads = commandListPayloads(groups, settings.style);
  const hash = createHash("sha1").update(JSON.stringify([settings.channelId, settings.style, payloads.map((p) => [p.content, (p.embeds ?? []).map((e) => (e as EmbedBuilder).toJSON())])])).digest("hex");
  const ids = idList(settings.messageIds);
  if (!force && hash === settings.hash && ids.length) return { ok: true };

  const channel = await client.channels.fetch(settings.channelId).catch(() => null);
  if (!isSendableChannel(channel) || !("messages" in channel)) return { ok: false, error: "Spartacus can't post in that channel." };
  let kept = ids.length === payloads.length;
  for (let i = 0; kept && i < payloads.length; i++) {
    const msg = await channel.messages.fetch(ids[i]).catch(() => null);
    const edit = { content: payloads[i].content ?? "", embeds: payloads[i].embeds ?? [] };
    if (!msg || !(await msg.edit(edit).then(() => true).catch(() => false))) kept = false;
  }
  let newIds = ids;
  if (!kept) {
    for (const id of ids) {
      const old = await channel.messages.fetch(id).catch(() => null);
      await old?.delete().catch(() => null);
    }
    newIds = [];
    for (const p of payloads) {
      const msg = await channel.send(p).catch((err) => {
        logError("bot", err, guildId);
        return null;
      });
      if (!msg) return { ok: false, error: "Discord wouldn't take the post. Check Spartacus can send messages and embeds there." };
      newIds.push(msg.id);
    }
  }
  await prisma.commandListSettings.update({ where: { guildId }, data: { messageIds: newIds, hash } });
  return { ok: true };
}

// Every few minutes: lists set to update by themselves catch any new, changed or removed command.
export async function commandListTick(client: Client) {
  const rows = await prisma.commandListSettings.findMany({ where: { autoUpdate: true, channelId: { not: null } }, select: { guildId: true } });
  for (const r of rows) {
    if (!client.guilds.cache.has(r.guildId)) continue;
    await refreshCommandList(client, r.guildId).catch((err) => logError("bot", err, r.guildId));
  }
}
