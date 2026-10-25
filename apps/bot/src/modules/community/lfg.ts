import { ChatInputCommandInteraction, EmbedBuilder, Message, ColorResolvable, VoiceBasedChannel } from "discord.js";
import type { LfgCommand, LfgCategory } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { applyEmbedExtra } from "../../lib/embedExtra";
import { substituteLfgTokens, buildLfgPingLine } from "../../lib/lfg";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";

export type LfgCommandWithCategories = LfgCommand & { categories: LfgCategory[] };

// Regular (non-interaction) messages can't be truly ephemeral — this is the
// standard workaround: reply normally, then delete it a few seconds later,
// so it still reads as "only meant for you" without leaving clutter behind.
const AUTO_DELETE_MS = 9000;
async function replyAndAutoDelete(message: Message, content: string) {
  if (!isSendableChannel(message.channel)) return;
  const sent = await message.reply({ content }).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => null), AUTO_DELETE_MS);
}

// A temp voice channel is usually gone within minutes of the announcement —
// once deleted, a plain <#id> mention permanently reads "#unknown" to anyone
// who opens the message later. Naming it in the text itself survives that;
// the mention stays too, so it is still clickable while the channel is live.
function voiceLabel(channel: { id: string; name: string }): string {
  return `${channel.name} (<#${channel.id}>)`;
}

// A direct channel-jump link — pasted bare on its own line, Discord unfurls
// this into its compact native voice card (icon, channel name, live "in
// {game}" if one's being played there, and a Join Voice button) for anyone
// who already has access to the channel. No invite needed, unlike a
// discord.gg/... link, which unfurls into a different "X others in voice"
// card instead — this is the one that actually matches the reference look.
function voiceJumpLink(guildId: string, channel: { id: string }): string {
  return `https://discord.com/channels/${guildId}/${channel.id}`;
}

// A category only overrides which channel it must be run in, who gets
// pinged, and the plain-text template — the embed/saved-embed always comes
// from the parent command, so all of a command's playlists share one look.
interface EffectiveLfg {
  channelId: string;
  roleId: string | null;
  includeSender: boolean;
  message: string | null;
}

function effective(cfg: LfgCommandWithCategories, category: LfgCategory | null): EffectiveLfg {
  // A category never has its own channel — it always posts alongside the
  // command itself, so channelId comes from cfg regardless of category.
  if (!category) return { channelId: cfg.channelId, roleId: cfg.roleId, includeSender: cfg.includeSender, message: cfg.message };
  return {
    channelId: cfg.channelId,
    roleId: category.roleId ?? cfg.roleId,
    includeSender: cfg.includeSender,
    message: category.message ?? cfg.message,
  };
}

const DEFAULT_PLAIN_TEMPLATE = "Join {members} in {voiceName}";

async function buildAnnouncement(cfg: LfgCommand, eff: EffectiveLfg, senderMention: string, voiceChannel: VoiceBasedChannel, note: string) {
  const members = [...voiceChannel.members.filter((m) => !m.user.bot).values()].map((m) => m.toString()).join(" + ") || senderMention;
  const roleTag = eff.roleId ? ` <-- <@&${eff.roleId}>` : "";
  const jumpLink = voiceJumpLink(cfg.guildId, voiceChannel);
  // Masked as the channel's name — clickable blue text in the sentence
  // itself. The same link is posted bare on its own line further below,
  // which is what actually triggers Discord's native voice card.
  const voiceNameLinked = `[${voiceChannel.name}](${jumpLink})`;
  const tokens = { user: senderMention, voice: voiceLabel(voiceChannel), voiceName: voiceNameLinked, members, roleTag, message: note || "—" };

  // Embeds render mentions as inert text — no notification fires for a role
  // or member mention that only appears inside one. The plain-text path
  // below doesn't need this since its own content carries real mentions.
  const ping = buildLfgPingLine(eff, senderMention);

  if (cfg.savedEmbedId) {
    const saved = await resolveSavedEmbed(cfg.savedEmbedId);
    if (saved) {
      const payload = await buildSavedEmbedPayload(cfg.guildId, saved);
      return { content: [ping, payload.content].filter(Boolean).join(" "), embeds: payload.embeds };
    }
  }

  if (cfg.mode === "embed") {
    const embed = new EmbedBuilder().setColor((cfg.embedColor as ColorResolvable) || "#7B99BC");
    if (cfg.embedTitle) embed.setTitle(substituteLfgTokens(cfg.embedTitle, tokens).slice(0, 256));
    if (cfg.embedDescription) embed.setDescription(substituteLfgTokens(cfg.embedDescription, tokens).slice(0, 4096));
    applyEmbedExtra(embed, cfg.embedExtra);
    return { content: ping || undefined, embeds: [embed] };
  }

  // Plain mode's own template already carries real mentions ({members},
  // {roleTag}) that ping on their own, so no separate ping line is needed
  // here. The note is always fenced as a code block — whether the template
  // places {message} itself, or (with no {message} block) it's appended on
  // its own line automatically — so it reads as "what they typed" rather
  // than more sentence either way.
  const template = eff.message || DEFAULT_PLAIN_TEMPLATE;
  const fencedMessage = note ? "```\n" + note + "\n```" : "";
  let text = substituteLfgTokens(template, { ...tokens, message: fencedMessage });
  if (note && !template.includes("{message}")) text = [text, fencedMessage].join("\n");
  return { content: text };
}

// ---- Slash command path (/​trigger) ----
export async function handleLfgInteraction(interaction: ChatInputCommandInteraction, cfg: LfgCommandWithCategories) {
  if (!cfg.enabled) {
    await interaction.reply({ content: "⚠️ This command is currently disabled for this server.", ephemeral: true });
    return;
  }

  // Discord requires picking one of these when the command has any — the
  // slash command was registered with the option marked required in that case.
  const categoryId = interaction.options.getString("category");
  const category = categoryId ? cfg.categories.find((c) => c.id === categoryId) ?? null : null;
  const eff = effective(cfg, category);

  if (interaction.channelId !== eff.channelId) {
    await interaction.reply({
      content: cfg.wrongChannelMessage.replace("{channel}", `<#${eff.channelId}>`),
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const voiceChannel = member?.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: cfg.errorMessage, ephemeral: true });
    return;
  }

  const note = interaction.options.getString("message") ?? "";
  const payload = await buildAnnouncement(cfg, eff, `${interaction.user}`, voiceChannel, note);
  payload.content = [payload.content, voiceJumpLink(cfg.guildId, voiceChannel)].filter(Boolean).join("\n");
  await interaction.reply(payload);
}

// ---- Prefix path (!trigger [note...]) ----
// No slash-style option here, so a category is picked by leading word: e.g.
// "!lfg ranked need 2 more" matches the "Ranked" category by name and the
// rest becomes the note. No match (or no categories at all) just uses the
// command's own defaults, with the whole line as the note.
export async function handleLfgMessage(message: Message, cfg: LfgCommandWithCategories, note: string) {
  let category: LfgCategory | null = null;
  if (cfg.categories.length) {
    const [firstWord, ...rest] = note.split(/\s+/);
    const match = cfg.categories.find((c) => c.name.toLowerCase() === firstWord?.toLowerCase());
    if (match) {
      category = match;
      note = rest.join(" ");
    }
  }
  const eff = effective(cfg, category);

  if (message.channelId !== eff.channelId) {
    await replyAndAutoDelete(message, cfg.wrongChannelMessage.replace("{channel}", `<#${eff.channelId}>`));
    return;
  }

  const voiceChannel = message.member?.voice.channel;
  if (!voiceChannel) {
    await replyAndAutoDelete(message, cfg.errorMessage);
    return;
  }

  if (!isSendableChannel(message.channel)) return;
  const payload = await buildAnnouncement(cfg, eff, `${message.author}`, voiceChannel, note);
  payload.content = [payload.content, voiceJumpLink(cfg.guildId, voiceChannel)].filter(Boolean).join("\n");
  await message.channel.send(payload);
}

export async function findLfgCommandByTrigger(guildId: string, trigger: string): Promise<LfgCommandWithCategories | null> {
  return prisma.lfgCommand.findUnique({ where: { guildId_trigger: { guildId, trigger } }, include: { categories: true } });
}
