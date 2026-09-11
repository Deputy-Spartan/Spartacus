import type { PrismaClient } from "@prisma/client";

// Shared vocabulary for what a button/select-menu-option in the Embed
// Creator can actually DO — used by apps/web (the editor UI), apps/api
// (raw-REST payload building), and apps/bot (discord.js payload building +
// the interaction handler that runs it). Keeping the type definitions here
// means all three stay in sync without importing across app boundaries.
export type EmbedActionType =
  | "none"
  | "give_role"
  | "remove_role"
  | "toggle_role"
  | "add_currency"
  | "send_message"
  | "post_embed"
  | "self_role"
  | "send_embed_to_channel";

export interface EmbedActionConfig {
  type: EmbedActionType;
  roleId?: string;
  currencyAmount?: number;
  messageText?: string;
  embedPresetId?: string;
  ephemeral?: boolean; // defaults to true everywhere except send_embed_to_channel
}

export interface EmbedSelectOption {
  label: string;
  value: string;
  action?: EmbedActionConfig;
}

// A configured action is only ever persisted at the moment a message is
// actually SENT — not when a preset is merely saved — so custom_id stays
// resolvable for exactly as long as that specific message exists, and
// editing a preset later never retroactively changes what an
// already-posted button does.
export async function createActionCustomId(prisma: PrismaClient, guildId: string, kind: "button" | "select", config: unknown): Promise<string> {
  const row = await prisma.embedComponentAction.create({ data: { guildId, kind, config: config as object } });
  return `ecaction:${row.id}`;
}
