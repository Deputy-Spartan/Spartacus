import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type BaseMessageOptions,
  type Interaction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { randomBytes } from "node:crypto";
import { GO_LIVE_DEFAULTS, LIVE_PLATFORMS, cleanHandle, platformInfo, type LivePlatform } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";
import { discordPayload, sendTestAlert } from "./goLive";

// /golive setup: the same questions as the dashboard's Going Live page, one
// step at a time in a private message. Answers are kept in memory for 20
// minutes and only saved at the end.

interface Answers {
  defaultChannelId: string | null;
  pingRoleId: string | null;
  contentTemplate: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  buttonLabel: string | null;
  embedColor: string | null;
  liveRoleId: string | null;
  updateWhileLive: boolean;
  endAction: "EDIT" | "DELETE" | "KEEP";
  cooldownMinutes: number;
  selfServeRoleId: string | null;
}
interface Wizard {
  guildId: string;
  userId: string;
  step: number;
  a: Answers;
  streamers: Array<{ platform: LivePlatform; handle: string; name: string | null }>;
  existing: number;
  expires: number;
}
const wizards = new Map<string, Wizard>();

const STEPS = [
  { title: "Alert Channel", text: "Where should going-live alerts be posted?" },
  { title: "Ping Role", text: "Which role should get pinged when someone goes live? You can skip this." },
  { title: "Streamers", text: "Pick a platform to add a streamer. Add as many as you like, then press Next." },
  { title: "The Message", text: "Keep the default alert, or write your own. Placeholders like {name}, {title}, {game} and {viewers} get filled in." },
  { title: "Color", text: "Pick the alert's color. Platform colors use purple for Twitch, red for YouTube, green for Kick and pink for TikTok." },
  { title: "Live Role", text: "Give linked streamers a role while they're live, like 🔴 Live Now? You can skip this." },
  { title: "Keep It Updated", text: "Refresh viewers, title and game on the alert every 2 minutes while they stream?" },
  { title: "When the Stream Ends", text: "What should happen to the alert when they stop?" },
  { title: "Repeat Alerts", text: "If their stream drops and comes back, how long before Spartacus posts a new alert?" },
  { title: "Who Can Use /golive", text: "Staff and linked streamers can always use /golive start. Pick a role to let others announce their own streams too." },
];
const COLORS: Array<[string, string]> = [
  ["", "🌈 Each platform's own color"],
  ["#5865F2", "💙 Blurple"],
  ["#ED4245", "❤️ Red"],
  ["#9146FF", "💜 Purple"],
  ["#57F287", "💚 Green"],
  ["#F1C40F", "💛 Gold"],
  ["#EB459E", "🩷 Pink"],
];
const COOLDOWNS = [0, 10, 30, 60, 120, 360];
const cd = (m: number) => (m === 0 ? "Always post a new one" : m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`);
const endText = { EDIT: "Change it to a summary (how long, peak viewers)", DELETE: "Delete the alert", KEEP: "Leave it as it is" };

const id = (wid: string, action: string) => `glw:${wid}:${action}`;
const row = (...c: MessageActionRowComponentBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...c);
const btn = (wid: string, action: string, label: string, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id(wid, action)).setLabel(label).setStyle(style).setDisabled(disabled);

function nav(wid: string, w: Wizard, canNext: boolean, skipLabel?: string) {
  const buttons = [btn(wid, "back", "← Back", ButtonStyle.Secondary, w.step === 0)];
  if (skipLabel) buttons.push(btn(wid, "skip", skipLabel));
  buttons.push(btn(wid, "next", "Next →", ButtonStyle.Primary, !canNext));
  buttons.push(btn(wid, "cancel", "Cancel", ButtonStyle.Danger));
  return row(...buttons);
}

function sampleInfo(w: Wizard) {
  const s = w.streamers[0];
  const platform: LivePlatform = s?.platform ?? "twitch";
  return {
    name: s?.name || s?.handle || "BustyBunz",
    platform,
    title: "Ranked grind to Champion 🏆",
    game: "Rainbow Six Siege",
    viewers: 127,
    url: platformInfo(platform).url(s?.handle || "bustybunz"),
    roleId: w.a.pingRoleId,
    userId: null,
  };
}

function render(wid: string, w: Wizard): BaseMessageOptions {
  if (w.step >= STEPS.length) return summary(wid, w);
  const step = STEPS[w.step];
  const head = new EmbedBuilder()
    .setColor(0x5e7fa6)
    .setAuthor({ name: `Going Live setup · Step ${w.step + 1} of ${STEPS.length}` })
    .setTitle(step.title)
    .setDescription(step.text);
  const embeds = [head];
  let comps: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const a = w.a;

  switch (w.step) {
    case 0:
      if (a.defaultChannelId) head.addFields({ name: "Picked", value: `<#${a.defaultChannelId}>` });
      comps = [row(new ChannelSelectMenuBuilder().setCustomId(id(wid, "channel")).setPlaceholder("Pick the alert channel").setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)), nav(wid, w, !!a.defaultChannelId)];
      break;
    case 1:
      head.addFields({ name: "Picked", value: a.pingRoleId ? `<@&${a.pingRoleId}>` : "No ping" });
      comps = [row(new RoleSelectMenuBuilder().setCustomId(id(wid, "ping")).setPlaceholder("Pick a role to ping")), nav(wid, w, true, "No ping")];
      break;
    case 2: {
      const list = w.streamers.map((s) => `${platformInfo(s.platform).emoji} **${s.name || s.handle}** · ${platformInfo(s.platform).name}`).join("\n");
      head.addFields({ name: `Adding (${w.streamers.length})`, value: list || "Nobody yet" });
      if (w.existing) head.setFooter({ text: `${w.existing} streamer${w.existing === 1 ? " is" : "s are"} already set up and stay as they are.` });
      comps = [
        row(
          new StringSelectMenuBuilder()
            .setCustomId(id(wid, "platform"))
            .setPlaceholder("＋ Add a streamer: pick their platform")
            .addOptions(LIVE_PLATFORMS.map((p) => ({ label: p.id === "other" ? "Other (Facebook, Trovo, Rumble, X…)" : `${p.name}${p.beta ? " (beta)" : ""}`, value: p.id, emoji: p.emoji, description: p.auto ? "Spartacus checks it automatically" : "Announced with /golive start" }))),
        ),
        nav(wid, w, true),
      ];
      break;
    }
    case 3: {
      const custom = a.contentTemplate || a.embedTitle || a.embedDescription || a.buttonLabel;
      head.addFields({ name: "Using", value: custom ? "Your own text (preview below)" : "The default (preview below)" });
      const p = discordPayload(a, sampleInfo(w));
      embeds.push(...((p.embeds ?? []) as EmbedBuilder[]));
      if (p.content) head.addFields({ name: "Message text", value: String(p.content).slice(0, 1024) });
      comps = [row(btn(wid, "default", "Use the default", custom ? ButtonStyle.Secondary : ButtonStyle.Success), btn(wid, "custom", "✏️ Write my own", ButtonStyle.Primary)), nav(wid, w, true)];
      break;
    }
    case 4: {
      const p = discordPayload(a, sampleInfo(w));
      embeds.push(...((p.embeds ?? []) as EmbedBuilder[]));
      comps = [
        row(
          new StringSelectMenuBuilder()
            .setCustomId(id(wid, "color"))
            .setPlaceholder("Pick a color")
            .addOptions([...COLORS.map(([v, l]) => ({ label: l, value: v || "platform", default: (a.embedColor ?? "") === v })), { label: "🎨 Custom (type a hex code)", value: "custom" }]),
        ),
        nav(wid, w, true),
      ];
      break;
    }
    case 5:
      head.addFields({ name: "Picked", value: a.liveRoleId ? `<@&${a.liveRoleId}>` : "No live role" });
      comps = [row(new RoleSelectMenuBuilder().setCustomId(id(wid, "liverole")).setPlaceholder("Pick the live role")), nav(wid, w, true, "Skip")];
      break;
    case 6:
      comps = [row(btn(wid, "update:yes", "Yes, keep it updated", a.updateWhileLive ? ButtonStyle.Success : ButtonStyle.Secondary), btn(wid, "update:no", "No", !a.updateWhileLive ? ButtonStyle.Success : ButtonStyle.Secondary)), nav(wid, w, true)];
      break;
    case 7:
      comps = [
        row(new StringSelectMenuBuilder().setCustomId(id(wid, "end")).addOptions(Object.entries(endText).map(([v, l]) => ({ label: l, value: v, default: a.endAction === v })))),
        nav(wid, w, true),
      ];
      break;
    case 8:
      comps = [
        row(new StringSelectMenuBuilder().setCustomId(id(wid, "cooldown")).addOptions(COOLDOWNS.map((m) => ({ label: cd(m), value: String(m), default: a.cooldownMinutes === m })))),
        nav(wid, w, true),
      ];
      break;
    case 9:
      head.addFields({ name: "Picked", value: a.selfServeRoleId ? `<@&${a.selfServeRoleId}>` : "Staff and linked streamers only" });
      comps = [row(new RoleSelectMenuBuilder().setCustomId(id(wid, "selfserve")).setPlaceholder("Pick the streamer role")), nav(wid, w, true, "Skip")];
      break;
  }
  return { embeds: embeds.slice(0, 10), components: comps, allowedMentions: { parse: [] } };
}

function summary(wid: string, w: Wizard): BaseMessageOptions {
  const a = w.a;
  const color = COLORS.find(([v]) => v === (a.embedColor ?? ""))?.[1] ?? a.embedColor ?? "";
  const e = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({ name: "Going Live setup · Check your answers" })
    .setTitle("All set?")
    .setDescription("Press **Save** to turn it on, or **Back** to change something. You can change all of this later on the dashboard too.")
    .addFields(
      { name: "Alert channel", value: a.defaultChannelId ? `<#${a.defaultChannelId}>` : "⚠️ Not picked", inline: true },
      { name: "Ping", value: a.pingRoleId ? `<@&${a.pingRoleId}>` : "No ping", inline: true },
      { name: "Color", value: color || "Platform colors", inline: true },
      { name: "Streamers to add", value: w.streamers.map((s) => `${platformInfo(s.platform).emoji} ${s.name || s.handle}`).join("\n") || (w.existing ? `None new (${w.existing} already set up)` : "None yet") },
      { name: "Message", value: a.contentTemplate || a.embedTitle || a.embedDescription || a.buttonLabel ? "Your own text" : "The default", inline: true },
      { name: "Live role", value: a.liveRoleId ? `<@&${a.liveRoleId}>` : "None", inline: true },
      { name: "Keep updated", value: a.updateWhileLive ? "Yes" : "No", inline: true },
      { name: "When it ends", value: endText[a.endAction], inline: true },
      { name: "Repeat alerts", value: cd(a.cooldownMinutes), inline: true },
      { name: "/golive start", value: a.selfServeRoleId ? `Staff, linked streamers and <@&${a.selfServeRoleId}>` : "Staff and linked streamers", inline: true },
    );
  return {
    embeds: [e],
    components: [row(btn(wid, "save", "✅ Save", ButtonStyle.Success, !a.defaultChannelId), btn(wid, "savetest", "🧪 Save and send a test", ButtonStyle.Primary, !a.defaultChannelId || !w.streamers.length && !w.existing), btn(wid, "back", "← Back"), btn(wid, "cancel", "Cancel", ButtonStyle.Danger))],
    allowedMentions: { parse: [] },
  };
}

export async function startGoLiveSetup(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const s = await prisma.streamAlertSettings.findUnique({ where: { guildId: interaction.guildId } });
  const existing = await prisma.streamSubscription.count({ where: { guildId: interaction.guildId } });
  const wid = randomBytes(5).toString("hex");
  for (const [k, v] of wizards) if (v.expires < Date.now()) wizards.delete(k);
  const w: Wizard = {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    step: 0,
    existing,
    streamers: [],
    expires: Date.now() + 20 * 60_000,
    a: {
      defaultChannelId: s?.defaultChannelId ?? null,
      pingRoleId: s?.pingRoleId ?? null,
      contentTemplate: s?.contentTemplate ?? null,
      embedTitle: s?.embedTitle ?? null,
      embedDescription: s?.embedDescription ?? null,
      buttonLabel: s?.buttonLabel ?? null,
      embedColor: s?.embedColor ?? null,
      liveRoleId: s?.liveRoleId ?? null,
      updateWhileLive: s?.updateWhileLive ?? true,
      endAction: (s?.endAction as Answers["endAction"]) ?? "EDIT",
      cooldownMinutes: s?.cooldownMinutes ?? 30,
      selfServeRoleId: s?.selfServeRoleId ?? null,
    },
  };
  wizards.set(wid, w);
  await interaction.reply({ ...render(wid, w), ephemeral: true });
}

const textInput = (cid: string, label: string, value: string | null, placeholder: string, style = TextInputStyle.Short, required = false, max = 200) =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max).setPlaceholder(placeholder.slice(0, 100)).setValue(value ?? ""),
  );

export async function handleGoLiveSetup(interaction: Interaction) {
  if (!("customId" in interaction) || !interaction.customId.startsWith("glw:")) return;
  const [, wid, action, arg] = interaction.customId.split(":");
  const w = wizards.get(wid);
  if (!w || w.expires < Date.now()) {
    if (interaction.isRepliable()) await interaction.reply({ content: "⌛ This setup expired. Run `/golive setup` again.", ephemeral: true }).catch(() => null);
    return;
  }
  if (interaction.user.id !== w.userId) {
    if (interaction.isRepliable()) await interaction.reply({ content: "This setup belongs to someone else.", ephemeral: true }).catch(() => null);
    return;
  }
  w.expires = Date.now() + 20 * 60_000;
  const a = w.a;
  const next = () => (w.step = Math.min(STEPS.length, w.step + 1));

  try {
    // Pop-up forms first: they have to open before anything else replies.
    if (interaction.isStringSelectMenu() && action === "platform") {
      const p = platformInfo(interaction.values[0]);
      const modal = new ModalBuilder()
        .setCustomId(id(wid, `addstreamer:${p.id}`))
        .setTitle(`Add a ${p.id === "other" ? "streamer" : `${p.name} streamer`}`)
        .addComponents(
          textInput("handle", p.id === "other" ? "Stream link" : "Channel name or link", null, p.handleHint, TextInputStyle.Short, true, 300),
          textInput("name", "Name to show (optional)", null, "Their channel name", TextInputStyle.Short, false, 80),
        );
      return void (await interaction.showModal(modal));
    }
    if (interaction.isButton() && action === "custom") {
      const modal = new ModalBuilder()
        .setCustomId(id(wid, "message"))
        .setTitle("Write your own alert")
        .addComponents(
          textInput("content", "Message text (above the embed)", a.contentTemplate, GO_LIVE_DEFAULTS.content, TextInputStyle.Paragraph, false, 500),
          textInput("title", "Embed title", a.embedTitle, GO_LIVE_DEFAULTS.title, TextInputStyle.Short, false, 200),
          textInput("description", "Embed text", a.embedDescription, GO_LIVE_DEFAULTS.description, TextInputStyle.Paragraph, false, 1000),
          textInput("button", "Button text", a.buttonLabel, GO_LIVE_DEFAULTS.button, TextInputStyle.Short, false, 80),
        );
      return void (await interaction.showModal(modal));
    }
    if (interaction.isStringSelectMenu() && action === "color" && interaction.values[0] === "custom") {
      const modal = new ModalBuilder().setCustomId(id(wid, "hex")).setTitle("Custom color").addComponents(textInput("hex", "Hex color", a.embedColor, "#5865F2", TextInputStyle.Short, true, 7));
      return void (await interaction.showModal(modal));
    }

    let note: string | null = null;
    if (interaction.isModalSubmit()) {
      if (action === "addstreamer") {
        const platform = arg as LivePlatform;
        const raw = interaction.fields.getTextInputValue("handle");
        const handle = cleanHandle(platform, raw);
        if (platform === "other" && !/^https?:\/\//i.test(handle)) note = "⚠️ For Other, paste the full stream link starting with https://";
        else if (handle) w.streamers.push({ platform, handle, name: interaction.fields.getTextInputValue("name").trim() || null });
      } else if (action === "message") {
        const v = (k: string) => interaction.fields.getTextInputValue(k).trim() || null;
        a.contentTemplate = v("content");
        a.embedTitle = v("title");
        a.embedDescription = v("description");
        a.buttonLabel = v("button");
      } else if (action === "hex") {
        const hex = interaction.fields.getTextInputValue("hex").trim();
        const ok = /^#?[0-9a-f]{6}$/i.test(hex);
        if (ok) {
          a.embedColor = hex.startsWith("#") ? hex : `#${hex}`;
          next();
        } else note = "⚠️ That isn't a hex color. Try something like #5865F2.";
      }
      if (interaction.isFromMessage()) await interaction.update({ ...render(wid, w), content: note ?? "" });
      return;
    }

    if (interaction.isChannelSelectMenu() && action === "channel") {
      a.defaultChannelId = interaction.values[0];
      next();
    } else if (interaction.isRoleSelectMenu()) {
      const r = interaction.values[0];
      if (action === "ping") a.pingRoleId = r;
      if (action === "liverole") a.liveRoleId = r;
      if (action === "selfserve") a.selfServeRoleId = r;
      next();
    } else if (interaction.isStringSelectMenu()) {
      const v = interaction.values[0];
      if (action === "color") a.embedColor = v === "platform" ? null : v;
      if (action === "end") a.endAction = v as Answers["endAction"];
      if (action === "cooldown") a.cooldownMinutes = Number(v);
      next();
    } else if (interaction.isButton()) {
      if (action === "cancel") {
        wizards.delete(wid);
        return void (await interaction.update({ content: "Setup cancelled. Nothing was changed.", embeds: [], components: [] }));
      }
      if (action === "back") w.step = Math.max(0, w.step - 1);
      else if (action === "next") next();
      else if (action === "skip") {
        if (w.step === 1) a.pingRoleId = null;
        if (w.step === 5) a.liveRoleId = null;
        if (w.step === 9) a.selfServeRoleId = null;
        next();
      } else if (action === "default") {
        a.contentTemplate = a.embedTitle = a.embedDescription = a.buttonLabel = null;
        next();
      } else if (action === "update") {
        a.updateWhileLive = arg === "yes";
        next();
      } else if (action === "save" || action === "savetest") {
        await interaction.deferUpdate();
        await prisma.streamAlertSettings.upsert({ where: { guildId: w.guildId }, create: { guildId: w.guildId, ...a }, update: a });
        let added = 0;
        let firstId: string | null = null;
        for (const s of w.streamers) {
          const dup = await prisma.streamSubscription.findFirst({ where: { guildId: w.guildId, platform: s.platform, channelName: s.handle } });
          if (dup) {
            firstId ??= dup.id;
            continue;
          }
          const sub = await prisma.streamSubscription.create({ data: { guildId: w.guildId, platform: s.platform, channelName: s.handle, displayName: s.name, announceChannelId: a.defaultChannelId! } });
          firstId ??= sub.id;
          added++;
        }
        firstId ??= (await prisma.streamSubscription.findFirst({ where: { guildId: w.guildId } }))?.id ?? null;
        let testNote = "";
        if (action === "savetest" && firstId) {
          const r = await sendTestAlert(interaction.client, firstId);
          testNote = r.ok ? `\n🧪 Sent a test alert to <#${a.defaultChannelId}> (it doesn't ping anyone).` : `\n⚠️ The test didn't send: ${r.error}`;
        }
        wizards.delete(wid);
        await interaction.editReply({
          content: `✅ **Going Live is set up.** ${added ? `Added ${added} streamer${added === 1 ? "" : "s"}. ` : ""}Spartacus checks every 2 minutes and posts in <#${a.defaultChannelId}> when someone goes live.${testNote}\nChange anything later on the dashboard's Going Live page, or run \`/golive setup\` again.`,
          embeds: [],
          components: [],
          allowedMentions: { parse: [] },
        });
        return;
      }
    }
    await interaction.update(render(wid, w));
  } catch (err) {
    logError("bot", err, w.guildId);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: "⚠️ Something went wrong. Try `/golive setup` again.", ephemeral: true }).catch(() => null);
  }
}
