import type { Guild } from "discord.js";

// One deleted or out-of-reach role fails the whole add, so this keeps only the
// roles the bot can actually hand out.
export function assignableRoleIds(guild: Guild, roleIds: string[]): string[] {
  return roleIds.filter((id) => {
    const role = guild.roles.cache.get(id);
    return !!role && role.editable && !role.managed;
  });
}
