import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client, Guild, GuildMember, Role } from "discord.js";
import { CHAT_RANKS } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";

// Chat ranks: nine roles from Recruit to General, each given at a level
// (Leveling's level roles). XP comes from chatting in Discord, time in voice
// and, with viewer rewards on, chatting in a live stream. A member only wears
// their highest rank: the lower ones come off as they move up.

const ASSETS = join(__dirname, "../../../assets/ranks");
const RANK_NAMES = new Set<string>(CHAT_RANKS.map((r) => r.name));

export interface RankSetupResult {
  created: string[];
  reused: string[];
  skippedLevels: string[];
  icons: boolean;
  promoted: number;
  error?: string;
}

export async function createRankRoles(client: Client, guildId: string): Promise<RankSetupResult> {
  const out: RankSetupResult = { created: [], reused: [], skippedLevels: [], icons: false, promoted: 0 };
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ...out, error: "Spartacus isn't in that server." };
  const me = guild.members.me;
  if (!me?.permissions.has("ManageRoles")) return { ...out, error: "Spartacus needs the Manage Roles permission." };
  out.icons = guild.features.includes("ROLE_ICONS");
  await guild.roles.fetch().catch(() => null);
  const byLevel = new Map<number, Role>();
  for (const rank of CHAT_RANKS) {
    let role = guild.roles.cache.find((r) => r.name === rank.name) ?? null;
    if (role) out.reused.push(rank.name);
    else {
      const icon = out.icons ? await readFile(join(ASSETS, rank.file)).catch(() => null) : null;
      role = await guild.roles
        .create({ name: rank.name, color: rank.color as `#${string}`, icon: icon ?? undefined, hoist: false, mentionable: false, reason: "Stream Growth: chat ranks" })
        .catch((err) => {
          logError("bot", err, guildId);
          return null;
        });
      if (!role) return { ...out, error: `Couldn't make the ${rank.name} role. Is Spartacus's role high enough in the list?` };
      out.created.push(rank.name);
    }
    byLevel.set(rank.level, role);
    const existing = await prisma.levelRole.findUnique({ where: { guildId_level: { guildId, level: rank.level } } });
    if (existing && existing.roleId !== role.id) {
      const other = guild.roles.cache.get(existing.roleId);
      if (other) {
        out.skippedLevels.push(`Level ${rank.level} already gives @${other.name}`);
        continue;
      }
    }
    await prisma.levelRole.upsert({ where: { guildId_level: { guildId, level: rank.level } }, create: { guildId, level: rank.level, roleId: role.id }, update: { roleId: role.id } });
  }
  await prisma.streamGrowthConfig.upsert({ where: { guildId }, create: { guildId, ranksCreatedAt: new Date() }, update: { ranksCreatedAt: new Date() } });
  out.promoted = await catchUp(guild, byLevel);
  return out;
}

// Gives everyone who already has XP the rank for their level.
async function catchUp(guild: Guild, byLevel: Map<number, Role>): Promise<number> {
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const rows = await prisma.memberXp.findMany({ where: { guildId: guild.id, level: { gte: levels[0] ?? 1 } }, select: { userId: true, level: true }, take: 2000 });
  let n = 0;
  for (const row of rows) {
    const lvl = [...levels].reverse().find((l) => l <= row.level);
    const role = lvl !== undefined ? byLevel.get(lvl) : null;
    if (!role) continue;
    const member = await guild.members.fetch(row.userId).catch(() => null);
    if (!member || member.roles.cache.has(role.id)) continue;
    await member.roles.add(role, "Chat rank for their level").catch(() => null);
    await dropLowerRanks(member, role);
    n++;
  }
  return n;
}

// Called after a level role is given: if it's a rank, the other ranks come off.
export async function dropLowerRanks(member: GuildMember, gained: Role) {
  if (!RANK_NAMES.has(gained.name)) return;
  const others = member.roles.cache.filter((r) => r.id !== gained.id && RANK_NAMES.has(r.name));
  for (const r of others.values()) await member.roles.remove(r, "Moved up a chat rank").catch(() => null);
}
