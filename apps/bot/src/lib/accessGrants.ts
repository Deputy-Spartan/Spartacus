import { Guild, GuildMember, PermissionsBitField } from "discord.js";

// What one reaction / button / dropdown choice hands out: any mix of roles and
// per-member channel access.
export interface AccessTarget {
  roleIds: string[];
  channelIds: string[];
}

export interface PanelOption extends AccessTarget {
  label?: string;
  emoji?: string;
}

// Stored options can be the legacy `{ roleId, label, emoji }` shape or the
// newer `{ roleIds, channelIds, ... }` one.
export function normalizeOption(raw: unknown): PanelOption {
  const o = (raw ?? {}) as { roleId?: string; roleIds?: string[]; channelIds?: string[]; label?: string; emoji?: string };
  const roleIds = [...new Set([...(o.roleIds ?? []), ...(o.roleId ? [o.roleId] : [])].filter(Boolean))];
  return { roleIds, channelIds: (o.channelIds ?? []).filter(Boolean), label: o.label, emoji: o.emoji };
}

// A custom emoji is stored as "<:name:id>" (or "<a:name:id>"), but Discord
// reports reactions by bare id — reduce both sides to the same key.
export function emojiKeyOf(stored: string): string {
  const m = stored.trim().match(/^<a?:\w+:(\d+)>$/);
  return m ? m[1] : stored.trim();
}

const TEXT_ALLOW = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true } as const;
const VOICE_ALLOW = { ViewChannel: true, Connect: true, Speak: true } as const;

function overwritableChannel(member: GuildMember, channelId: string) {
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel || !("permissionOverwrites" in channel)) return null;
  return channel;
}

export function memberHasAccess(member: GuildMember, target: AccessTarget): boolean {
  if (target.roleIds.length === 0 && target.channelIds.length === 0) return false;
  const rolesOk = target.roleIds.every((r) => member.roles.cache.has(r));
  const channelsOk = target.channelIds.every((id) => {
    const ch = overwritableChannel(member, id);
    const ow = ch?.permissionOverwrites.cache.get(member.id);
    return !!ow && ow.allow.has(PermissionsBitField.Flags.ViewChannel);
  });
  return rolesOk && channelsOk;
}

export async function grantAccess(member: GuildMember, target: AccessTarget): Promise<void> {
  if (target.roleIds.length) await member.roles.add(target.roleIds);
  for (const id of target.channelIds) {
    const ch = overwritableChannel(member, id);
    if (!ch) continue;
    await ch.permissionOverwrites.edit(member, ch.isVoiceBased() ? VOICE_ALLOW : TEXT_ALLOW);
  }
}

export async function revokeAccess(member: GuildMember, target: AccessTarget): Promise<void> {
  if (target.roleIds.length) await member.roles.remove(target.roleIds);
  for (const id of target.channelIds) {
    const ch = overwritableChannel(member, id);
    if (!ch) continue;
    await ch.permissionOverwrites.delete(member).catch(() => null);
  }
}

export function describeAccess(target: AccessTarget): string {
  return [...target.roleIds.map((r) => `<@&${r}>`), ...target.channelIds.map((c) => `<#${c}>`)].join(", ");
}

// DMs can't resolve <@&id> / <#id> mentions (they show as "@unknown-role"),
// so anything sent outside the server spells the names out.
export function describeAccessNames(guild: Guild, target: AccessTarget): string {
  return [
    ...target.roleIds.map((r) => `@${guild.roles.cache.get(r)?.name ?? "role"}`),
    ...target.channelIds.map((c) => `#${guild.channels.cache.get(c)?.name ?? "channel"}`),
  ].join(", ");
}
