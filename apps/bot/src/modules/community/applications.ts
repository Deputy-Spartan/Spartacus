import {
  ActionRowBuilder,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";

interface ApplicationQuestion {
  label: string;
  style: "SHORT" | "PARAGRAPH";
  required: boolean;
}

const PAGE_SIZE = 5; // Discord's hard cap on text inputs per modal

// Applications support unlimited questions by chaining modals — 5 questions
// per popup, immediately followed by the next one, until every question has
// been asked. Answers accumulate here between pages since a modal submit
// can't carry more than its own customId back to us.
const pendingAnswers = new Map<string, Array<{ label: string; answer: string }>>();

function sessionKey(userId: string, typeId: string) {
  return `${userId}:${typeId}`;
}

function questionsOf(type: { questions: unknown }): ApplicationQuestion[] {
  return Array.isArray(type.questions) ? (type.questions as unknown as ApplicationQuestion[]) : [];
}

function buildQuestionModal(panelId: string, typeId: string, typeName: string, page: number, pageQuestions: ApplicationQuestion[]) {
  return new ModalBuilder()
    .setCustomId(`applicationmodal:${panelId}:${typeId}:${page}`)
    .setTitle(page === 0 ? typeName.slice(0, 45) : `${typeName.slice(0, 35)} (cont.)`)
    .addComponents(
      pageQuestions.map((q, i) =>
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(`q${i}`)
            .setLabel(q.label.slice(0, 45))
            .setStyle(q.style === "PARAGRAPH" ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(q.required)
        )
      )
    );
}

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

  pendingAnswers.delete(sessionKey(interaction.user.id, type.id)); // start fresh in case of an abandoned earlier attempt
  await interaction.showModal(buildQuestionModal(panelId, type.id, type.name, 0, questions.slice(0, PAGE_SIZE)));
}

export async function handleApplicationContinue(interaction: ButtonInteraction, panelId: string, typeId: string, pageStr: string) {
  const type = await prisma.applicationType.findUnique({ where: { id: typeId } });
  if (!type) {
    await interaction.reply({ content: "This application type no longer exists.", ephemeral: true });
    return;
  }

  const questions = questionsOf(type);
  const page = Number(pageStr) || 0;
  const pageQuestions = questions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  await interaction.showModal(buildQuestionModal(panelId, typeId, type.name, page, pageQuestions));
}

export async function handleApplicationSubmit(interaction: ModalSubmitInteraction, panelId: string, typeId: string, pageStr: string) {
  if (!interaction.guild) return;

  const type = await prisma.applicationType.findUnique({ where: { id: typeId } });
  if (!type) {
    await interaction.reply({ content: "This application type no longer exists.", ephemeral: true });
    return;
  }

  const questions = questionsOf(type);
  const page = Number(pageStr) || 0;
  const pageQuestions = questions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const key = sessionKey(interaction.user.id, typeId);
  const soFar = pendingAnswers.get(key) ?? [];
  const withThisPage = [
    ...soFar,
    ...pageQuestions.map((q, i) => ({ label: q.label, answer: interaction.fields.getTextInputValue(`q${i}`) || "(no answer)" })),
  ];

  const nextPageStart = (page + 1) * PAGE_SIZE;
  if (nextPageStart < questions.length) {
    // More questions left. Discord won't let a modal submission open another
    // modal directly — only a button/select interaction can — so this asks
    // for one more click to continue, which itself opens the next modal.
    pendingAnswers.set(key, withThisPage);
    const continueRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`applicationcontinue:${panelId}:${typeId}:${page + 1}`)
        .setLabel(`Continue (${withThisPage.length}/${questions.length} answered)`)
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: "Got it — click below to answer the rest.", components: [continueRow], ephemeral: true });
    return;
  }

  pendingAnswers.delete(key);
  const answers = withThisPage;

  const application = await prisma.application.create({
    data: { guildId: interaction.guild.id, panelId, typeId, userId: interaction.user.id, answers },
  });

  await interaction.reply({ content: "✅ Your application has been submitted for review.", ephemeral: true });

  const settings = await prisma.applicationSettings.findUnique({ where: { guildId: interaction.guild.id } });
  const reviewChannelId = type.reviewChannelId ?? settings?.logChannelId;
  if (reviewChannelId) {
    const reviewChannel = await interaction.guild.channels.fetch(reviewChannelId).catch(() => null);
    if (isSendableChannel(reviewChannel)) {
      const staffRoleIds = Array.isArray(type.staffRoleIds) ? (type.staffRoleIds as string[]) : [];
      const settingsRoleIds = settings && Array.isArray(settings.supportRoleIds) ? (settings.supportRoleIds as string[]) : [];
      const pingRoles = [...new Set([...staffRoleIds, ...settingsRoleIds])];

      // A Discord embed caps at 25 fields — beyond that, questions still get
      // asked and recorded, just not all individually itemized in the review
      // embed (the dashboard's Submissions tab always has the full list).
      const embed = new EmbedBuilder()
        .setColor(0x4c8dff)
        .setTitle(`New Application — ${type.name}`)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .addFields(answers.slice(0, 25).map((a) => ({ name: a.label.slice(0, 256), value: a.answer.slice(0, 1024) })))
        .setFooter({ text: `Applicant ID: ${interaction.user.id}${answers.length > 25 ? ` · ${answers.length - 25} more answer(s) on the dashboard` : ""}` })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`application:${application.id}:accept`).setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`application:${application.id}:deny`).setLabel("Deny").setStyle(ButtonStyle.Danger)
      );

      const message = await reviewChannel
        .send({ content: pingRoles.map((r) => `<@&${r}>`).join(" ") || undefined, embeds: [embed], components: [row] })
        .catch(() => null);
      if (message) await prisma.application.update({ where: { id: application.id }, data: { reviewMessageId: message.id } });
    }
  }
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
