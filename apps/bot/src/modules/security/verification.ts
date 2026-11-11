import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
import type { VerificationConfig } from "@prisma/client";

export const VERIFY_DEFAULTS = {
  title: "✅ Verify Yourself",
  description: "Click the button below to verify and get access to the rest of the server.",
  color: "#57F287",
  buttonLabel: "Verify",
  buttonEmoji: "✅",
  verified: "✅ You're verified! Welcome to **{server}**.",
  alreadyVerified: "You're already verified!",
  noRole: "Verification isn't set up in this server yet. Ask an admin to pick a Verified role.",
  tooNew: "Your Discord account is too new to verify in **{server}** yet. Try again in a few days.",
  noAvatar: "Add a profile picture to your Discord account, then press Verify again.",
  captchaPrompt: "🤖 Quick check: tap the button that shows **{code}**.",
  captchaWrong: "❌ That wasn't the right code. Press Verify to try again.",
  dmConfirm: "✅ You're verified in **{server}**. Enjoy the server!",
  reminder: "👋 Just a reminder: you still need to verify in **{server}** to get access. Head back and press Verify.",
  kick: "You were removed from **{server}** because you didn't verify in time. You're welcome to join again and verify.",
};

const fill = (template: string | null | undefined, fallback: string, tokens: Record<string, string>) => {
  let out = template?.trim() ? template : fallback;
  for (const [k, v] of Object.entries(tokens)) out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  return out;
};

type Interaction = ButtonInteraction | ChatInputCommandInteraction;
type Result = "VERIFIED" | "FAILED" | "TOO_NEW" | "NO_AVATAR" | "KICKED";

export async function logVerification(guildId: string, member: { id: string; user: { tag: string } }, result: Result, detail?: string) {
  await prisma.verificationLog.create({ data: { guildId, userId: member.id, username: member.user.tag, result, detail: detail ?? null } }).catch(() => null);
}

async function postLog(member: GuildMember, config: VerificationConfig, text: string, color: number) {
  if (!config.logChannelId) return;
  const ch = await member.guild.channels.fetch(config.logChannelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()] }).catch(() => null);
}

// Checks that run before anything is asked or given. Returns a reply to
// show when the member can't verify yet, or null when they can go ahead.
async function preCheck(config: VerificationConfig | null, member: GuildMember): Promise<string | null> {
  const server = member.guild.name;
  if (!config?.verifiedRoleId) return fill(config?.noRoleReply, VERIFY_DEFAULTS.noRole, { server });
  if (member.roles.cache.has(config.verifiedRoleId)) return fill(config.alreadyVerifiedReply, VERIFY_DEFAULTS.alreadyVerified, { server });
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (config.minAccountAgeDays && ageDays < config.minAccountAgeDays) {
    await logVerification(member.guild.id, member, "TOO_NEW", `Account is ${Math.floor(ageDays)} day(s) old`);
    return fill(config.accountTooNewMessage, VERIFY_DEFAULTS.tooNew, { server });
  }
  if (config.requireAvatar && !member.user.avatar) {
    await logVerification(member.guild.id, member, "NO_AVATAR");
    return fill(config.noAvatarMessage, VERIFY_DEFAULTS.noAvatar, { server });
  }
  return null;
}

// Gives the role and does everything that goes with it. Shared by the
// button, /verify and the captcha so they all behave the same.
async function grant(config: VerificationConfig, member: GuildMember): Promise<string> {
  const server = member.guild.name;
  try {
    await member.roles.add(config.verifiedRoleId!);
  } catch (err) {
    logError("bot", err, member.guild.id);
    return "⚠️ I can't give that role. Ask an admin to move Spartacus's role above it in Server Settings → Roles.";
  }
  if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) await member.roles.remove(config.unverifiedRoleId).catch(() => null);
  await prisma.verificationPendingMember.deleteMany({ where: { guildId: member.guild.id, userId: member.id } }).catch(() => null);
  await logVerification(member.guild.id, member, "VERIFIED", config.method === "CAPTCHA" ? "Captcha" : "Button");
  await postLog(member, config, `✅ <@${member.id}> verified and got <@&${config.verifiedRoleId}>.`, 0x2ecc71);
  if (config.dmConfirmEnabled) await member.send(fill(config.dmConfirmMessage, VERIFY_DEFAULTS.dmConfirm, { server })).catch(() => null);
  return fill(config.verifiedReply, VERIFY_DEFAULTS.verified, { server });
}

// Kept for anything that still verifies directly: runs the checks, then grants.
export async function verifyMember(config: VerificationConfig | null, member: GuildMember): Promise<{ ok: boolean; message: string }> {
  const blocked = await preCheck(config, member);
  if (blocked) return { ok: false, message: blocked };
  return { ok: true, message: await grant(config!, member) };
}

// ---- Captcha ----
// Four codes, one right. Held in memory for 5 minutes; a restart just means
// pressing Verify again.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = () => Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
const captchas = new Map<string, { guildId: string; userId: string; answer: number; codes: string[]; expires: number }>();

function captchaPayload(config: VerificationConfig, guildName: string, userId: string, guildId: string) {
  for (const [k, v] of captchas) if (v.expires < Date.now()) captchas.delete(k);
  const codes = new Set<string>();
  while (codes.size < 4) codes.add(code());
  const list = [...codes];
  const answer = randomInt(4);
  const token = randomBytes(6).toString("hex");
  captchas.set(token, { guildId, userId, answer, codes: list, expires: Date.now() + 5 * 60_000 });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    list.map((c, i) => new ButtonBuilder().setCustomId(`verify:cap:${token}:${i}`).setLabel(c).setStyle(ButtonStyle.Secondary)),
  );
  return { content: fill(config.captchaPrompt, VERIFY_DEFAULTS.captchaPrompt, { server: guildName, code: `\`${list[answer]}\`` }), components: [row], ephemeral: true };
}

// The Verify button and /verify both start here.
export async function startVerification(interaction: Interaction) {
  if (!interaction.guild) return;
  const config = await prisma.verificationConfig.findUnique({ where: { guildId: interaction.guild.id } });
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "⚠️ Couldn't find your membership in this server.", ephemeral: true });
    return;
  }
  const blocked = await preCheck(config, member);
  if (blocked) {
    await interaction.reply({ content: blocked, ephemeral: true });
    return;
  }
  if (config!.method === "CAPTCHA") {
    await interaction.reply(captchaPayload(config!, interaction.guild.name, member.id, interaction.guild.id));
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply(await grant(config!, member));
}

export async function handleVerifyButton(interaction: ButtonInteraction) {
  await startVerification(interaction);
}

export async function handleCaptchaAnswer(interaction: ButtonInteraction, token: string, choice: number) {
  const c = captchas.get(token);
  if (!c || c.userId !== interaction.user.id || c.expires < Date.now()) {
    await interaction.update({ content: "⌛ That check expired. Press Verify again.", components: [] });
    return;
  }
  captchas.delete(token);
  const guild = interaction.guild;
  if (!guild) return;
  const config = await prisma.verificationConfig.findUnique({ where: { guildId: guild.id } });
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!config || !member) return;

  if (choice === c.answer) {
    const blocked = await preCheck(config, member);
    await interaction.update({ content: blocked ?? (await grant(config, member)), components: [] });
    return;
  }

  // Wrong answer: count it, and act once they hit the limit.
  const pending = await prisma.verificationPendingMember.upsert({
    where: { guildId_userId: { guildId: guild.id, userId: member.id } },
    create: { guildId: guild.id, userId: member.id, failures: 1 },
    update: { failures: { increment: 1 } },
  });
  await logVerification(guild.id, member, "FAILED", `Wrong captcha (${pending.failures}/${config.maxFailures})`);
  const limitHit = config.maxFailures > 0 && pending.failures >= config.maxFailures;
  if (limitHit && config.failAction === "KICK" && member.kickable) {
    await interaction.update({ content: `❌ Too many wrong answers. You'll be removed from **${guild.name}**.`, components: [] });
    await member.send(`You were removed from **${guild.name}** after too many wrong verification answers. You can join again and retry.`).catch(() => null);
    await member.kick("Failed verification too many times").catch((err) => logError("bot", err, guild.id));
    await prisma.verificationPendingMember.deleteMany({ where: { guildId: guild.id, userId: member.id } }).catch(() => null);
    await logVerification(guild.id, member, "KICKED", "Too many wrong captcha answers");
    await postLog(member, config, `👢 <@${member.id}> was kicked after ${pending.failures} wrong verification answers.`, 0xe74c3c);
    return;
  }
  const left = config.maxFailures > 0 ? config.maxFailures - pending.failures : null;
  const note = left !== null && left > 0 && config.failAction === "KICK" ? `\n-# ${left} tr${left === 1 ? "y" : "ies"} left.` : "";
  await interaction.update({ content: fill(config.captchaWrongReply, VERIFY_DEFAULTS.captchaWrong, { server: guild.name }) + note, components: [] });
}

// ---- Joining ----
// Tracks new members for reminders and auto-kick, and gives the Unverified role.
export async function onVerificationJoin(member: GuildMember) {
  if (member.user.bot) return;
  if (!(await isModuleEnabled(member.guild.id, "VERIFICATION"))) return;
  const config = await prisma.verificationConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.verifiedRoleId) return;
  await prisma.verificationPendingMember
    .upsert({
      where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
      create: { guildId: member.guild.id, userId: member.id },
      update: { joinedAt: new Date(), remindedAt: null, failures: 0 },
    })
    .catch(() => null);
  if (config.giveUnverifiedOnJoin && config.unverifiedRoleId) await member.roles.add(config.unverifiedRoleId).catch(() => null);
}

// ---- The panel ----
function verifyRow(config: VerificationConfig) {
  const button = new ButtonBuilder()
    .setCustomId("verify:click")
    .setLabel((config.buttonLabel?.trim() || VERIFY_DEFAULTS.buttonLabel).slice(0, 80))
    .setStyle(ButtonStyle.Success);
  const emoji = config.buttonLabel?.trim() ? config.buttonEmoji?.trim() : config.buttonEmoji?.trim() || VERIFY_DEFAULTS.buttonEmoji;
  if (emoji) button.setEmoji(emoji);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

// Posts (or reposts after a channel/embed change) the verification panel —
// shared by the catch-up cron and the dashboard's immediate "Save" trigger.
export async function postVerificationPanel(client: Client, config: VerificationConfig): Promise<boolean> {
  if (!config.panelChannelId) return false;
  const enabled = await isModuleEnabled(config.guildId, "VERIFICATION");
  if (!enabled) return false;

  const channel = await client.channels.fetch(config.panelChannelId).catch(() => null);
  if (!isSendableChannel(channel)) return false;

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const color = /^#[0-9a-f]{6}$/i.test(config.embedColor ?? "") ? (config.embedColor as `#${string}`) : (VERIFY_DEFAULTS.color as `#${string}`);
  const payload = saved
    ? await buildSavedEmbedPayload(config.guildId, saved)
    : {
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle(config.defaultEmbedTitle?.trim() || VERIFY_DEFAULTS.title)
            .setDescription(config.defaultEmbedDescription?.trim() || VERIFY_DEFAULTS.description),
        ],
      };

  const message = await channel
    .send({ ...payload, components: [...(payload.components ?? []), verifyRow(config)] })
    .catch((err) => {
      logError("bot", err, config.guildId);
      return null;
    });
  if (!message) return false;

  await prisma.verificationConfig.update({ where: { id: config.id }, data: { panelMessageId: message.id } });
  return true;
}

// Maintenance: gives the Verified role to everyone already in the server, so
// turning verification on doesn't lock out existing members. Pages through the
// member list over REST (the gateway's "fetch all members" is rate limited and
// can fail quietly), and says why when it can't run.
export interface VerifyExistingResult {
  given: number;
  failed: number;
  already: number;
  checked: number;
  error?: string;
}

export async function verifyExistingMembers(client: Client, guildId: string): Promise<VerifyExistingResult> {
  const result: VerifyExistingResult = { given: 0, failed: 0, already: 0, checked: 0 };
  const config = await prisma.verificationConfig.findUnique({ where: { guildId } });
  if (!config?.verifiedRoleId) return { ...result, error: "Pick a Verified role in step 1 first." };
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { ...result, error: "Spartacus isn't in this server." };
  const role = await guild.roles.fetch(config.verifiedRoleId).catch(() => null);
  if (!role) return { ...result, error: "The Verified role no longer exists. Pick it again in step 1." };
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions.has("ManageRoles")) return { ...result, error: "Spartacus needs the Manage Roles permission." };
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    return { ...result, error: `Spartacus's role is below ${role.name}, so it can't give it. Drag Spartacus above it in Server Settings → Roles, then try again.` };
  }

  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    const batch = await guild.members.list({ limit: 1000, after, cache: false }).catch((err) => {
      logError("bot", err, guildId);
      return null;
    });
    if (!batch) return { ...result, error: "Discord wouldn't send the member list. Try again in a minute." };
    for (const m of batch.values()) {
      if (m.user.bot) continue;
      result.checked++;
      if (m.roles.cache.has(config.verifiedRoleId)) {
        result.already++;
        continue;
      }
      const ok = await m.roles.add(config.verifiedRoleId, "Verified existing members (dashboard)").then(() => true, () => false);
      if (ok) {
        result.given++;
        if (config.unverifiedRoleId && m.roles.cache.has(config.unverifiedRoleId)) await m.roles.remove(config.unverifiedRoleId).catch(() => null);
      } else result.failed++;
    }
    if (batch.size < 1000) break;
    after = batch.lastKey();
  }
  await prisma.verificationPendingMember.deleteMany({ where: { guildId } }).catch(() => null);
  return result;
}
