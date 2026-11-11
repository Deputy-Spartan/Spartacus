import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

// The bot's role does the work, so without this a moderator could act on
// someone ranked above them. Returns the reason to refuse, or null to go ahead.
export async function moderationBlock(interaction: ChatInputCommandInteraction, target: GuildMember): Promise<string | null> {
  const { guild } = target;
  if (target.id === interaction.user.id) return "You can't do that to yourself.";
  if (target.id === interaction.client.user.id) return "I can't do that to myself.";
  if (target.id === guild.ownerId) return "You can't do that to the server owner.";
  if (interaction.user.id === guild.ownerId) return null;
  const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!actor || target.roles.highest.comparePositionTo(actor.roles.highest) >= 0) return "That member's top role is equal to or above yours.";
  return null;
}
