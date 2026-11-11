// What the honeypot does to someone who posts in the trap channel.
export const HONEYPOT_ACTIONS = ["BAN", "SOFTBAN", "KICK", "TIMEOUT"] as const;
export type HoneypotAction = (typeof HONEYPOT_ACTIONS)[number];

export const HONEYPOT_ACTION_INFO: Record<HoneypotAction, { label: string; description: string; past: string; counter: string }> = {
  BAN: { label: "Ban", description: "Removes them for good and deletes their last day of messages.", past: "banned", counter: "Bans" },
  SOFTBAN: {
    label: "Soft ban",
    description: "Bans then unbans right away. Their last day of messages is wiped and they can rejoin with a new invite. Good for hacked accounts.",
    past: "soft banned",
    counter: "Soft bans",
  },
  KICK: { label: "Kick", description: "Removes them, and they can rejoin with an invite. Their other messages stay.", past: "kicked", counter: "Kicks" },
  TIMEOUT: { label: "Timeout", description: "Mutes them for a set time so staff can take a look. They stay in the server.", past: "timed out", counter: "Timeouts" },
};

export const HONEYPOT_COUNTER_SCOPES = ["SERVER", "WEEK", "GLOBAL"] as const;
export type HoneypotCounterScope = (typeof HONEYPOT_COUNTER_SCOPES)[number];

export const HONEYPOT_SCOPE_LABELS: Record<HoneypotCounterScope, string> = {
  SERVER: "This server, all time",
  WEEK: "This server, last 7 days",
  GLOBAL: "Every server Spartacus protects",
};

export interface HoneypotStats {
  server: number; // caught in this server, all time
  week: number; // caught in this server in the last 7 days
  global: number; // caught across every server
  servers: number; // servers with the honeypot switched on and a channel picked
}

export function honeypotAction(value: string | null | undefined): HoneypotAction {
  return HONEYPOT_ACTIONS.includes(value as HoneypotAction) ? (value as HoneypotAction) : "BAN";
}

// The greyed-out button under the message, like "🍯 Bans: 367".
export function honeypotCounterLabel(action: string, scope: string, stats: HoneypotStats): string {
  const word = HONEYPOT_ACTION_INFO[honeypotAction(action)].counter;
  if (scope === "WEEK") return `🍯 ${word} this week: ${stats.week.toLocaleString("en-US")}`;
  if (scope === "GLOBAL") return `🍯 Caught in all servers: ${stats.global.toLocaleString("en-US")}`;
  return `🍯 ${word}: ${stats.server.toLocaleString("en-US")}`;
}

export const HONEYPOT_TOKENS: Array<{ token: string; description: string }> = [
  { token: "{action}", description: "What happens to them: banned, soft banned, kicked or timed out" },
  { token: "{count}", description: "How many this server's honeypot has caught" },
  { token: "{week}", description: "How many it caught in the last 7 days" },
  { token: "{global}", description: "How many were caught across every server" },
  { token: "{servers}", description: "How many servers have a honeypot running" },
  { token: "{server}", description: "Your server's name" },
];

export function honeypotTokenValues(action: string, stats: HoneypotStats, server: string): Record<string, string> {
  return {
    "{action}": HONEYPOT_ACTION_INFO[honeypotAction(action)].past,
    "{count}": stats.server.toLocaleString("en-US"),
    "{week}": stats.week.toLocaleString("en-US"),
    "{global}": stats.global.toLocaleString("en-US"),
    "{servers}": stats.servers.toLocaleString("en-US"),
    "{server}": server,
  };
}

// What posts until someone designs their own message.
export function defaultHoneypotMessage(): { content: string; embeds: Array<Record<string, unknown>>; components: Array<Record<string, unknown>> } {
  return {
    content: "",
    embeds: [
      {
        id: "default-honeypot",
        title: "🍯 Do not post in this channel",
        description:
          "This channel is a trap for spam bots and hacked accounts. It is not a place to chat.\n\nAnything sent here is **deleted automatically**, and the account that sent it is **{action}**.\n\nIf you can read this, just leave the channel alone and you're fine.",
        color: "#F5A524",
        fields: [],
      },
    ],
    components: [],
  };
}
