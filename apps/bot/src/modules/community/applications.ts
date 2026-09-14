import {
  ActionRowBuilder,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  Message,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.MessageCreate;

interface ApplicationQuestion {
  label: string;
  style: "SHORT" | "PARAGRAPH";
  required: boolean;
}

function questionsOf(type: { questions: unknown }): ApplicationQuestion[] {
  return Array.isArray(type.questions) ? (type.questions as unknown as ApplicationQuestion[]) : [];
}

// Applications are conducted entirely over DM — one question at a time, the
// applicant just types their answer back — rather than Discord's modal
// system, which caps at 5 fields per popup. A draft on ApplicationDraft
// tracks where in the question list a given user currently is.
export async function handleApplyButton(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  panelId: string,
  typeId?: string
) {
  const panel = await prisma.applicationPanel.findUnique({ where: { id: panelId } });
  if (!panel || panel.paused) {
    await interaction.reply({ content: "This application isn't accepting submissions right now.", ephemeral: true });
    return;
  }

  const resolvedTypeId = interaction.isStringSelectMenu() ? interaction.values[0] : typeId;
  const type = resolvedTypeId ? await prisma.applicationType.findUnique({ where: { id: resolvedTypeId } }) : null;
  if (!type || !type.enabled) {
    await interaction.reply({ content: "This application type isn't configured yet.", ephemeral: true });
    return;
  }

  const questions = questionsOf(type);
  if (questions.length === 0) {
    await interaction.reply({ content: "This application type has no questions configured yet.", ephemeral: true });
    return;
  }

  const existing = await prisma.applicationDraft.findUnique({ where: { userId: interaction.user.id } });
  if (existing) {
    await interaction.reply({
      content: existing.typeId === type.id
        ? "You already have an application in progress — check your DMs and keep answering, or ignore this to start over."
        : "You already have a different application in progress in your DMs. Finish or ignore that one first.",
      ephemeral: true,
    });
    if (existing.typeId === type.id) return;
  }

  const firstQuestion = questions[0];
  const introDm = await interaction.user
    .send(
      `📋 **${type.name}**\n` +
        (type.description ? `${type.description}\n\n` : "\n") +
        `I'll ask ${questions.length} question${questions.length === 1 ? "" : "s"}, one at a time — just reply here with your answer to each.\n\n` +
        `**1/${questions.length}.** ${firstQuestion.label}`
    )
    .catch(() => null);

  if (!introDm) {
    await interaction.reply({
      content: "⚠️ I couldn't DM you — please enable DMs from server members and try again.",
      ephemeral: true,
    });
    return;
  }

  await prisma.applicationDraft.upsert({
    where: { userId: interaction.user.id },
    create: { guildId: panel.guildId, panelId, typeId: type.id, userId: interaction.user.id, questionIndex: 0, answers: [] },
    update: { guildId: panel.guildId, panelId, typeId: type.id, questionIndex: 0, answers: [] },
  });

  await interaction.reply({ content: "📬 Check your DMs — I've sent you the first question.", ephemeral: true });
}

// Every non-bot DM is checked against an in-progress draft (matched by
// userId only, since a DM channel carries no guildId of its own) — replies
// advance the draft to the next question, or finalize it once every
// question's answered.
export async function execute(message: Message) {
  if (message.author.bot || message.guild) return; // only DMs

  const draft = await prisma.applicationDraft.findUnique({ where: { userId: message.author.id } });
  if (!draft) return;

  const enabled = await isModuleEnabled(draft.guildId, "APPLICATIONS");
  if (!enabled) {
    await prisma.applicationDraft.delete({ where: { id: draft.id } }).catch(() => null);
    await message.reply("⚠️ Applications got disabled for that server — this application has been cancelled.").catch(() => null);
    return;
  }

  const type = await prisma.applicationType.findUnique({ where: { id: draft.typeId } });
  if (!type) {
    await prisma.applicationDraft.delete({ where: { id: draft.id } }).catch(() => null);
    await message.reply("⚠️ This application type no longer exists — it's been cancelled.").catch(() => null);
    return;
  }

  const questions = questionsOf(type);
  const current = questions[draft.questionIndex];
  if (!current) {
    // Shouldn't happen, but leaves no dangling draft if question list shrank mid-conversation.
    await prisma.applicationDraft.delete({ where: { id: draft.id } }).catch(() => null);
    return;
  }

  const answer = message.content.trim();
  if (current.required && !answer) {
    await message.reply("That question needs an answer — please reply with some text.").catch(() => null);
    return;
  }

  const answers = [...(Array.isArray(draft.answers) ? (draft.answers as Array<{ label: string; answer: string }>) : []), {
    label: current.label,
    answer: answer || "(no answer)",
  }];

  const nextIndex = draft.questionIndex + 1;
  const nextQuestion = questions[nextIndex];

  if (nextQuestion) {
    await prisma.applicationDraft.update({ where: { id: draft.id }, data: { questionIndex: nextIndex, answers } });
    await message.reply(`**${nextIndex + 1}/${questions.length}.** ${nextQuestion.label}`).catch(() => null);
    return;
  }

  await prisma.applicationDraft.delete({ where: { id: draft.id } }).catch(() => null);
  await finalizeApplication(message, draft.guildId, draft.panelId, type, answers);
}

async function finalizeApplication(
  message: Message,
  guildId: string,
  panelId: string,
  type: { id: string; name: string; reviewChannelId: string | null; staffRoleIds: unknown },
  answers: Array<{ label: string; answer: string }>
) {
  const application = await prisma.application.create({
    data: { guildId, panelId, typeId: type.id, userId: message.author.id, answers },
  });

  await message.reply("✅ Thanks — your application has been submitted for review!").catch(() => null);

  const guild = await message.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const settings = await prisma.applicationSettings.findUnique({ where: { guildId } });
  const reviewChannelId = type.reviewChannelId ?? settings?.logChannelId;
  if (!reviewChannelId) return;

  const reviewChannel = await guild.channels.fetch(reviewChannelId).catch(() => null);
  if (!isSendableChannel(reviewChannel)) return;

  const staffRoleIds = Array.isArray(type.staffRoleIds) ? (type.staffRoleIds as string[]) : [];
  const settingsRoleIds = settings && Array.isArray(settings.supportRoleIds) ? (settings.supportRoleIds as string[]) : [];
  const pingRoles = [...new Set([...staffRoleIds, ...settingsRoleIds])];

  // A Discord embed caps at 25 fields — beyond that, questions still get
  // asked and recorded, just not all individually itemized in the review
  // embed (the dashboard's Submissions tab always has the full list).
  const embed = new EmbedBuilder()
    .setColor(0x4c8dff)
    .setTitle(`New Application — ${type.name}`)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .addFields(answers.slice(0, 25).map((a, i) => ({ name: `${i + 1}. ${a.label}`.slice(0, 256), value: a.answer.slice(0, 1024) })))
    .setFooter({ text: `Applicant ID: ${message.author.id}${answers.length > 25 ? ` · ${answers.length - 25} more answer(s) on the dashboard` : ""}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`application:${application.id}:accept`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`application:${application.id}:deny`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );

  const sent = await reviewChannel
    .send({ content: pingRoles.map((r) => `<@&${r}>`).join(" ") || undefined, embeds: [embed], components: [row] })
    .catch(() => null);
  if (sent) await prisma.application.update({ where: { id: application.id }, data: { reviewMessageId: sent.id } });
}

export async function handleApplicationReview(interaction: ButtonInteraction, applicationId: string, decision: "accept" | "deny") {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "You don't have permission to review applications.", ephemeral: true });
    return;
  }

  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) {
    await interaction.reply({ content: "This application no longer exists.", ephemeral: true });
    return;
  }
  if (application.status !== "PENDING") {
    await interaction.reply({ content: `This application was already ${application.status.toLowerCase()}.`, ephemeral: true });
    return;
  }

  const type = application.typeId ? await prisma.applicationType.findUnique({ where: { id: application.typeId } }) : null;

  const status = decision === "accept" ? "ACCEPTED" : "DENIED";
  await prisma.application.update({ where: { id: applicationId }, data: { status, reviewedBy: interaction.user.id } });

  const original = interaction.message;
  const embed = EmbedBuilder.from(original.embeds[0]).setColor(decision === "accept" ? 0x22c55e : 0xef4444).setFooter({
    text: `${decision === "accept" ? "Accepted" : "Denied"} by ${interaction.user.tag}`,
  });
  await interaction.update({ embeds: [embed], components: [] });

  const template = decision === "accept" ? type?.acceptMessage : type?.denyMessage;
  const dmText = (template || (decision === "accept" ? "🎉 Your application was accepted!" : "Your application was not accepted this time.")).replace(
    /{type}/g,
    type?.name ?? "this role"
  );

  const applicant = await interaction.client.users.fetch(application.userId).catch(() => null);
  await applicant?.send(dmText).catch(() => null);
}
