// Every Spartacus action: what it's called, its icon, which settings it uses,
// and whether it's a key or a Stream Deck + dial.

export type Field = "channel" | "voice" | "role" | "ping" | "module" | "embed" | "game" | "text" | "question" | "prize" | "minutes" | "count" | "streamer" | "link" | "note" | "slow" | "liveChannel" | "safeChannel" | "confirm";

export interface ActionDef {
  id: string;
  name: string;
  icon: string;
  tip: string;
  fields: Field[];
  dial?: { rotate: string; push: string; touch?: string };
  confirm?: boolean; // ask for a second press
}

export const KEYS: ActionDef[] = [
  { id: "raid", name: "Raid Lockdown", icon: "🚨", tip: "Read-only chat and paused invites. Press again to undo.", fields: [], confirm: true },
  { id: "safe", name: "Stream Safe Mode", icon: "🛡️", tip: "Pauses invites and turns on slowmode while you stream.", fields: ["channel", "slow"] },
  { id: "golive", name: "Go Live", icon: "⚡", tip: "Live Indicator, Stream Safe and your Go Live post in one press.", fields: ["liveChannel", "game", "safeChannel", "slow", "embed", "channel", "ping"] },
  { id: "liveind", name: "Live Indicator", icon: "🔴", tip: "Renames a channel to 🔴 LIVE while you stream.", fields: ["channel", "game"] },
  { id: "post", name: "Go Live Post", icon: "📢", tip: "Posts a saved embed with a role ping.", fields: ["embed", "channel", "ping"] },
  { id: "bump", name: "Bump Timer", icon: "⏰", tip: "Live countdown. Press to send the bump message.", fields: [] },
  { id: "lock", name: "Lock Channel", icon: "🔒", tip: "Locks or unlocks a channel.", fields: ["channel"] },
  { id: "slow", name: "Slowmode", icon: "🐢", tip: "Off, 5s, 10s, 30s, 1m.", fields: ["channel"] },
  { id: "module", name: "Module Switch", icon: "🧩", tip: "Turns a module on or off.", fields: ["module"] },
  { id: "role", name: "My Role", icon: "🎭", tip: "Gives you a role or takes it away.", fields: ["role"] },
  { id: "squadlock", name: "Lock My Squad", icon: "🔊", tip: "Locks the voice channel you're in.", fields: [] },
  { id: "mute", name: "Mute Squad", icon: "🔇", tip: "Mutes everyone in your voice channel but you.", fields: [] },
  { id: "pull", name: "Pull My Squad", icon: "🎧", tip: "Moves everyone from a lobby into your channel.", fields: ["voice"] },
  { id: "newsquad", name: "New Squad", icon: "➕", tip: "Makes a temp squad for a game and moves you in.", fields: ["game"] },
  { id: "online", name: "Online", icon: "📊", tip: "Live online count.", fields: [] },
  { id: "tickets", name: "Open Tickets", icon: "🎟️", tip: "Count. Press to open the Tickets page.", fields: [] },
  { id: "claim", name: "Claim Ticket", icon: "🙋", tip: "Claims the oldest waiting ticket.", fields: [] },
  { id: "apps", name: "Applications", icon: "✅", tip: "Count. Press to open them.", fields: [] },
  { id: "giveaway", name: "Giveaway", icon: "🎁", tip: "Starts a giveaway and counts down.", fields: ["prize", "minutes", "channel"] },
  { id: "purge", name: "Clear Chat", icon: "🧹", tip: "Deletes the last few messages.", fields: ["channel", "count"], confirm: true },
  { id: "poll", name: "Quick Poll", icon: "🗳️", tip: "Posts a 👍 / 👎 poll.", fields: ["question", "channel"] },
  { id: "say", name: "Say", icon: "💬", tip: "Posts a message as Spartacus.", fields: ["text", "channel"] },
  { id: "shout", name: "Shoutout", icon: "📣", tip: "Posts a shoutout card for a streamer.", fields: ["streamer", "link", "note", "channel"] },
  { id: "event", name: "Start Event", icon: "📅", tip: "Starts your next event and pings sign-ups.", fields: [] },
  { id: "sticky", name: "Resend Sticky", icon: "📌", tip: "Moves a sticky back to the bottom.", fields: ["channel"] },
  { id: "status", name: "My Status", icon: "🟢", tip: "Live, Be right back, Offline.", fields: ["channel", "note"] },
  { id: "botstat", name: "Bot Status", icon: "💚", tip: "Is Spartacus online, and its ping.", fields: [] },
];

export const DIALS: ActionDef[] = [
  { id: "dslow", name: "Slowmode Dial", icon: "🐢", tip: "Turn for seconds. Press to turn it off.", fields: ["channel"], dial: { rotate: "Slowmode seconds", push: "Turn it off" } },
  { id: "dlimit", name: "Squad Limit Dial", icon: "👥", tip: "Turn for your voice channel's limit. Press to lock.", fields: [], dial: { rotate: "User limit", push: "Lock or unlock" } },
  { id: "dlock", name: "Channel Lock Dial", icon: "🔀", tip: "Turn to pick a channel. Press to lock or unlock it.", fields: [], dial: { rotate: "Pick a channel", push: "Lock or unlock" } },
  { id: "dstats", name: "Live Stats Dial", icon: "📊", tip: "Turn to flip between live counts.", fields: [], dial: { rotate: "Next stat", push: "Refresh", touch: "Next stat" } },
  { id: "dtimer", name: "Quick Timer Dial", icon: "⏱️", tip: "Turn for minutes, tap for giveaway or poll, press to start.", fields: ["prize", "question", "channel"], dial: { rotate: "Minutes", push: "Start", touch: "Giveaway or poll" } },
  { id: "dxp", name: "XP Boost Dial", icon: "⭐", tip: "Turn 1x to 3x. Press for an hour of boosted XP.", fields: ["channel"], dial: { rotate: "1x to 3x", push: "Start an hour" } },
  { id: "dpurge", name: "Clear Chat Dial", icon: "🧹", tip: "Turn for how many. Press twice to clear.", fields: ["channel"], dial: { rotate: "How many", push: "Clear (press twice)" }, confirm: true },
  { id: "dmm", name: "Matchmaking Dial", icon: "🎮", tip: "Press to open or close matchmaking.", fields: [], dial: { rotate: "—", push: "Open or close" } },
];

export const PLUGIN_UUID = "com.spartacus.streamdeck";
export const ALL = [...KEYS, ...DIALS];
export const idFromUuid = (uuid: string) => uuid.replace(`${PLUGIN_UUID}.`, "");
