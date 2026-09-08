import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import { addBalance, getConfig } from "../../lib/economy";
import type { CommandModule } from "../types";

const QUESTIONS = [
  { q: "Which company develops Discord?", choices: ["Discord Inc.", "Slack Technologies", "Valve", "Riot Games"], answer: 0 },
  { q: "What language is discord.js written in?", choices: ["Python", "JavaScript/TypeScript", "Rust", "Go"], answer: 1 },
  { q: "What does XP stand for in a leveling bot?", choices: ["Extra Points", "Experience Points", "Exchange Points", "Expert Prestige"], answer: 1 },
  { q: "In Discord, what is a 'guild'?", choices: ["A player faction", "A server", "A voice channel", "A bot permission"], answer: 1 },
];

const command: CommandModule = {
  moduleKey: "TRIVIA",
  data: new SlashCommandBuilder().setName("trivia").setDescription("Answer a trivia question for a small coin reward") as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    const reward = 50;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      question.choices.map((choice, i) =>
        new ButtonBuilder().setCustomId(`trivia:${question.answer}:${i}:${reward}`).setLabel(choice).setStyle(ButtonStyle.Secondary)
      )
    );

    await interaction.reply({ content: `🧠 **${question.q}**`, components: [row] });
  },
};

export default command;

export async function handleTriviaAnswer(
  interaction: import("discord.js").ButtonInteraction,
  correctIndex: number,
  chosenIndex: number,
  reward: number
) {
  if (!interaction.guildId) return;
  const correct = correctIndex === chosenIndex;

  if (correct) {
    await addBalance(interaction.guildId, interaction.user.id, reward);
    const config = await getConfig(interaction.guildId);
    await interaction.reply(`✅ Correct! You earned **${reward} ${config.currencyName}**.`);
  } else {
    await interaction.reply({ content: "❌ Not quite — try the next one!", ephemeral: true });
  }
}
