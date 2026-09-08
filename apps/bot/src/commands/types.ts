import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { ModuleKey } from "@spartacus/shared";

export interface CommandModule {
  data: SlashCommandBuilder;
  moduleKey?: ModuleKey; // undefined = always available (e.g. /help)
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
