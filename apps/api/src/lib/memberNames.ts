import { getBotClient } from "./botClient";

// Display names for a few member ids, so the dashboard can show people
// instead of numbers. Falls back to the id when the bot can't see them.
export async function memberNames(guildId: string, ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)].slice(0, 100);
  const out: Record<string, string> = Object.fromEntries(unique.map((id) => [id, id]));
  const guild = getBotClient()?.guilds.cache.get(guildId);
  if (!guild || !unique.length) return out;
  const members = await guild.members.fetch({ user: unique }).catch(() => null);
  for (const id of unique) {
    const m = members?.get(id) ?? guild.members.cache.get(id);
    if (m) out[id] = m.displayName;
  }
  return out;
}
