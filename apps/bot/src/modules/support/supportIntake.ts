import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import type { SupportQuestion } from "@spartacus/db";
import type { Prisma } from "@prisma/client";

export const name = Events.MessageCreate;

function choicesOf(question: { choices: unknown }): string[] {
  return Array.isArray(question.choices) ? (question.choices as string[]) : [];
}

function choiceRows(ticketId: string, choices: string[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < choices.length && i < 25; i += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        choices.slice(i, i + 5).map((choice, j) =>
          new ButtonBuilder()
            .setCustomId(`suppintake:choice:${ticketId}:${i + j}`)
            .setLabel(choice.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }
  return rows;
}

async function askQuestion(message: Message | null, userSend: (payload: unknown) => Promise<unknown>, ticketId: string, question: SupportQuestion, index: number, total: number) {
  const prefix = `**${index + 1}/${total}.** ${question.prompt}`;
  if (question.mode === "CHOICE") {
    const choices = choicesOf(question);
    await userSend({ content: prefix, components: choiceRows(ticketId, choices) });
  } else {
    await userSend({ content: prefix });
  }
}

interface TranscriptEntry {
  from: "member" | "staff" | "system";
  authorTag: string;
  content: string;
  at: string;
}

// Appended live at every relay/lifecycle point rather than fetched from the
// channel at close time, since the ticket channel gets deleted a few
// seconds after closing — this is the only copy of the conversation left.
async function appendTranscript(ticketId: string, entry: Omit<TranscriptEntry, "at">) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const transcript = Array.isArray(ticket.transcript) ? (ticket.transcript as unknown as TranscriptEntry[]) : [];
  transcript.push({ ...entry, at: new Date().toISOString() });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { transcript: transcript as unknown as Prisma.InputJsonValue } }).catch(() => null);
}

function ticketControlRow(ticketId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`suppintake:ticket:${ticketId}:claim`).setLabel("Claim").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`suppintake:ticket:${ticketId}:close`).setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

async function finalizeTicket(client: Message["client"], ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const flow = await prisma.supportFlow.findUnique({ where: { id: ticket.flowId } });
  const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (!guild || !flow) return;

  const overwrites: Array<{ id: string; allow?: bigint[]; deny?: bigint[] }> = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
  ];
  if (flow.roleId) overwrites.push({ id: flow.roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

  const channel = await guild.channels.create({
    name: `support-${(user?.username ?? ticket.userId).toLowerCase()}`.replace(/[^a-z0-9-]/g, "").slice(0, 90) || `support-${ticket.id.slice(0, 6)}`,
    type: ChannelType.GuildText,
    parent: flow.categoryId ?? undefined,
    permissionOverwrites: overwrites,
  });

  const answers = Array.isArray(ticket.answers) ? (ticket.answers as Array<{ prompt: string; answer: string }>) : [];
  const embed = new EmbedBuilder()
    .setColor((flow.color as `#${string}`) || "#5865F2")
    .setTitle(`📨 Support Ticket — ${flow.label}`)
    .setAuthor({ name: user?.tag ?? ticket.userId, iconURL: user?.displayAvatarURL() })
    .addFields(answers.slice(0, 25).map((a, i) => ({ name: `${i + 1}. ${a.prompt}`.slice(0, 256), value: (a.answer || "(no answer)").slice(0, 1024) })))
    .setFooter({ text: `User ID: ${ticket.userId} — replies in this channel are relayed back to their DM` })
    .setTimestamp();

  await channel.send({
    content: flow.roleId ? `<@&${flow.roleId}>` : undefined,
    embeds: [embed],
    components: [ticketControlRow(ticket.id)],
  });

  const qaLines = answers.map((a, i) => `${i + 1}. ${a.prompt}\n→ ${a.answer || "(no answer)"}`).join("\n\n");
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: "OPEN",
      channelId: channel.id,
      transcript: [
        { from: "system", authorTag: "Spartacus", content: `Ticket opened — ${flow.label}`, at: new Date().toISOString() },
        ...(qaLines ? [{ from: "system" as const, authorTag: "Intake Q&A", content: qaLines, at: new Date().toISOString() }] : []),
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  await user
    ?.send(`✅ Thanks — I've opened a support ticket for your **${flow.label}** request. A staff member will reply here in this DM once they pick it up.`)
    .catch(() => null);
}

// Entry point for every member DM. Three states, checked in order:
// an already-open ticket relays the message to its channel; a draft
// mid-question-chain advances it; otherwise this looks for a guild that
// has the module enabled and this user as a member, and shows the flow
// picker — same guild-matching loop Modmail uses.
export async function execute(message: Message) {
  if (message.author.bot || message.guild) return;

  const openTicket = await prisma.supportTicket.findFirst({
    where: { userId: message.author.id, status: { in: ["OPEN", "CLAIMED"] } },
  });
  if (openTicket?.channelId) {
    const guild = await message.client.guilds.fetch(openTicket.guildId).catch(() => null);
    const channel = guild ? await guild.channels.fetch(openTicket.channelId).catch(() => null) : null;
    if (isSendableChannel(channel)) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setAuthor({ name: `${message.author.tag} (DM)`, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || "*(no text content)*"),
        ],
      });
      await message.react("📨").catch(() => null);
      await appendTranscript(openTicket.id, { from: "member", authorTag: message.author.tag, content: message.content || "(no text content)" });
    }
    return;
  }

  const draft = await prisma.supportTicket.findFirst({ where: { userId: message.author.id, status: "DRAFT" } });
  if (draft) {
    await advanceDraft(message, draft.id);
    return;
  }

  for (const guild of message.client.guilds.cache.values()) {
    const isMember = await guild.members.fetch(message.author.id).catch(() => null);
    if (!isMember) continue;

    const enabled = await isModuleEnabled(guild.id, "SUPPORT_INTAKE");
    if (!enabled) continue;

    const flows = await prisma.supportFlow.findMany({ where: { guildId: guild.id, enabled: true }, orderBy: { sortOrder: "asc" } });
    const settings = await prisma.supportSettings.findUnique({ where: { guildId: guild.id } });

    if (flows.length === 0) {
      const noFlows = (settings?.noFlowsMessage || "⚠️ Support requests aren't set up yet — an admin needs to add a category first.")
        .replace(/{server}/g, guild.name)
        .replace(/{user}/g, message.author.username);
      await message.reply(noFlows).catch(() => null);
      return;
    }

    const intro = (settings?.introMessage || "👋 Hey! What do you need help with in **{server}**?")
      .replace(/{server}/g, guild.name)
      .replace(/{user}/g, message.author.username);

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < flows.length && i < 25; i += 5) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          flows.slice(i, i + 5).map((f) =>
            new ButtonBuilder().setCustomId(`suppintake:flow:${f.id}`).setLabel(f.label.slice(0, 80)).setStyle(ButtonStyle.Primary)
          )
        )
      );
    }

    await message.reply({ content: intro, components: rows }).catch(() => null);
    return;
  }
}

async function advanceDraft(message: Message, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;

  const flow = await prisma.supportFlow.findUnique({ where: { id: ticket.flowId }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  if (!flow) {
    await prisma.supportTicket.delete({ where: { id: ticketId } }).catch(() => null);
    return;
  }

  const current = flow.questions[ticket.questionIndex];
  if (!current) {
    await prisma.supportTicket.delete({ where: { id: ticketId } }).catch(() => null);
    return;
  }
  if (current.mode === "CHOICE") {
    await message.reply("Please use the buttons above to answer that question.").catch(() => null);
    return;
  }

  const answer = message.content.trim();
  if (!answer) {
    await message.reply("Please reply with some text to answer that question.").catch(() => null);
    return;
  }

  await progressTicket(message.client, ticketId, flow, current, answer, (payload) => message.reply(payload as never));
}

async function progressTicket(
  client: Message["client"],
  ticketId: string,
  flow: { questions: SupportQuestion[] },
  current: SupportQuestion,
  answerText: string,
  send: (payload: unknown) => Promise<unknown>
) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;

  const answers = [
    ...(Array.isArray(ticket.answers) ? (ticket.answers as Array<{ prompt: string; answer: string }>) : []),
    { prompt: current.prompt, answer: answerText },
  ];

  const nextIndex = ticket.questionIndex + 1;
  const nextQuestion = flow.questions[nextIndex];

  if (nextQuestion) {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { questionIndex: nextIndex, answers } });
    await askQuestion(null, send, ticketId, nextQuestion, nextIndex, flow.questions.length);
    return;
  }

  await prisma.supportTicket.update({ where: { id: ticketId }, data: { answers } });
  await finalizeTicket(client, ticketId);
}

// DM button: picking a flow starts (or restarts) its question chain.
export async function handleFlowSelect(interaction: ButtonInteraction, flowId: string) {
  const flow = await prisma.supportFlow.findUnique({ where: { id: flowId }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  if (!flow || !flow.enabled) {
    await interaction.reply({ content: "This option isn't available right now.", ephemeral: true });
    return;
  }
  if (flow.questions.length === 0) {
    await interaction.reply({ content: "This support category isn't configured with any questions yet.", ephemeral: true });
    return;
  }

  const existing = await prisma.supportTicket.findFirst({
    where: { userId: interaction.user.id, status: { in: ["DRAFT", "OPEN", "CLAIMED"] } },
  });
  if (existing) {
    await interaction.reply({ content: "You already have a support request in progress in your DMs — finish that one first.", ephemeral: true });
    return;
  }

  const ticket = await prisma.supportTicket.create({
    data: { guildId: flow.guildId, flowId: flow.id, userId: interaction.user.id, questionIndex: 0, answers: [] },
  });

  await interaction.update({ content: `**${flow.label}** — got it.`, components: [] }).catch(() => null);
  await askQuestion(null, (payload) => interaction.followUp(payload as never), ticket.id, flow.questions[0], 0, flow.questions.length);
}

// DM button: answering a CHOICE-mode question.
export async function handleChoiceAnswer(interaction: ButtonInteraction, ticketId: string, choiceIndexStr: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status !== "DRAFT") {
    await interaction.reply({ content: "This question is no longer active.", ephemeral: true });
    return;
  }

  const flow = await prisma.supportFlow.findUnique({ where: { id: ticket.flowId }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  const current = flow?.questions[ticket.questionIndex];
  if (!flow || !current) {
    await interaction.reply({ content: "This question is no longer active.", ephemeral: true });
    return;
  }

  const choices = choicesOf(current);
  const choice = choices[Number(choiceIndexStr)];
  if (!choice) {
    await interaction.reply({ content: "That option is no longer available.", ephemeral: true });
    return;
  }

  await interaction.update({ content: `**${current.prompt}**\n→ ${choice}`, components: [] }).catch(() => null);
  await progressTicket(interaction.client, ticketId, flow, current, choice, (payload) => interaction.followUp(payload as never));
}

// Guild channel button: Claim/Close on a support ticket's own channel.
export async function handleTicketControl(interaction: ButtonInteraction, ticketId: string, action: "claim" | "close") {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    await interaction.reply({ content: "This ticket no longer exists.", ephemeral: true });
    return;
  }

  if (action === "claim") {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "CLAIMED", claimedById: interaction.user.id } });
    await interaction.reply(`🙋 Ticket claimed by <@${interaction.user.id}>.`);
    await appendTranscript(ticketId, { from: "system", authorTag: "Spartacus", content: `Claimed by ${interaction.user.tag}` });
    const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
    await user?.send("🙋 A staff member has picked up your support ticket.").catch(() => null);
    return;
  }

  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "CLOSED", closedAt: new Date() } });
  await appendTranscript(ticketId, { from: "system", authorTag: "Spartacus", content: `Closed by ${interaction.user.tag}` });
  await interaction.reply("🔒 Closing this ticket in 5 seconds…");

  const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
  await user?.send("🔒 Your support ticket has been closed. DM me again if you need anything else.").catch(() => null);

  setTimeout(() => interaction.channel?.delete().catch(() => null), 5000);
}

// Guild-side: any plain staff message typed in an OPEN/CLAIMED support
// ticket's channel relays to the member's DM — the staff half of the
// two-way bridge (the member's half is handled in execute() above).
export async function handleStaffMessage(message: Message) {
  if (!message.guildId || message.author.bot) return;

  const ticket = await prisma.supportTicket.findFirst({
    where: { channelId: message.channelId, status: { in: ["OPEN", "CLAIMED"] } },
  });
  if (!ticket) return;
  if (!message.content.trim()) return;

  const user = await message.client.users.fetch(ticket.userId).catch(() => null);
  await user
    ?.send(`**Staff:** ${message.content}`)
    .then(() => message.react("✅"))
    .catch(() => message.react("❌"));
  await appendTranscript(ticket.id, { from: "staff", authorTag: message.author.tag, content: message.content });
}
