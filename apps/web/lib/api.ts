const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "spartacus_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface ModuleState {
  enabled: boolean;
  config: Record<string, unknown> | null;
}

export interface WelcomeConfig {
  guildId: string;
  channelId: string | null;
  welcomeText: string;
  goodbyeText: string;
  embedColor: string;
}

export interface AutomodConfig {
  bannedWords: string[];
  antiLink: boolean;
  spamCap: boolean;
}

export interface CustomCommand {
  id: string;
  trigger: string;
  response: string;
}

export interface StreamSubscription {
  id: string;
  platform: "twitch" | "youtube";
  channelName: string;
  announceChannelId: string;
  isLive: boolean;
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  channelId: string;
  startTime: string;
  status: string;
  signups: Array<{ userId: string; role: string }>;
}

export interface LeaderboardRow {
  userId: string;
  xp: number;
  level: number;
}

export interface DiscordChannelOption {
  id: string;
  name: string;
  categoryName: string | null;
}
export interface DiscordChannels {
  categories: Array<{ id: string; name: string }>;
  textChannels: DiscordChannelOption[];
  voiceChannels: DiscordChannelOption[];
}
export interface DiscordRoleOption {
  id: string;
  name: string;
  color: number;
}

export interface LoggingConfig {
  guildId: string;
  logChannelId: string | null;
  logEdits: boolean;
  logDeletes: boolean;
  logJoinsLeaves: boolean;
  logVoice: boolean;
}

export interface AntiRaidConfig {
  guildId: string;
  alertChannelId: string | null;
  joinRateLimit: number;
  joinRateWindowSec: number;
  minAccountAgeDays: number;
  autoLockdown: boolean;
}

export interface ReactionRoleRow {
  id: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;
}

export interface JoinRoleRow {
  id: string;
  roleId: string;
}

export interface StickyMessageRow {
  id: string;
  channelId: string;
  content: string;
}

export interface StarboardConfig {
  guildId: string;
  channelId: string | null;
  threshold: number;
}

export interface TempChannelLobbyRow {
  id: string;
  name: string;
  lobbyChannelId: string;
  categoryId: string | null;
  nameFormat: string;
  userLimit: number;
  bitrate: number;
  deleteAfterEmptySec: number;
  pairTextChannel: boolean;
  hideTextFromNonMembers: boolean;
}

export interface TicketPanelRow {
  id: string;
  name: string;
  channelId: string;
  categoryId: string | null;
  buttonLabel: string;
  supportRoleId: string | null;
}

export interface TicketRow {
  id: string;
  channelId: string;
  userId: string;
  status: string;
  claimedById: string | null;
}

export interface GiveawayRow {
  id: string;
  channelId: string;
  prize: string;
  winnerCount: number;
  endsAt: string;
  ended: boolean;
  entries: Array<{ userId: string }>;
}

export interface EconomyConfig {
  guildId: string;
  currencyName: string;
  currencyIcon: string;
  messageEarnMin: number;
  messageEarnMax: number;
  dailyAmount: number;
  maxBet: number;
}
export interface EconomyBalanceRow {
  userId: string;
  balance: number;
}
export interface VerificationConfig {
  guildId: string;
  verifiedRoleId: string | null;
  minAccountAgeDays: number;
}
export interface AntiNukeConfig {
  guildId: string;
  alertChannelId: string | null;
  maxBansPerMinute: number;
  maxChannelDeletesPerMinute: number;
  stripRolesOnTrigger: boolean;
}
export interface HoneypotConfig {
  guildId: string;
  channelId: string | null;
}
export interface LevelRoleRow {
  id: string;
  level: number;
  roleId: string;
}
export interface CountingGameConfig {
  guildId: string;
  channelId: string | null;
  currentCount: number;
  resetOnMistake: boolean;
  highScore: number;
}

export const api = {
  getGuilds: () => request<Array<{ id: string; name: string; icon: string | null }>>("/guilds"),

  getModules: (guildId: string) => request<Record<string, ModuleState>>(`/guilds/${guildId}/modules`),
  setModule: (guildId: string, key: string, enabled: boolean) =>
    request(`/guilds/${guildId}/modules/${key}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),

  getWelcome: (guildId: string) => request<WelcomeConfig>(`/guilds/${guildId}/welcome`),
  setWelcome: (guildId: string, config: Partial<WelcomeConfig>) =>
    request<WelcomeConfig>(`/guilds/${guildId}/welcome`, { method: "PUT", body: JSON.stringify(config) }),

  getModeration: (guildId: string) =>
    request<{ enabled: boolean; config: AutomodConfig }>(`/guilds/${guildId}/moderation`),
  setModeration: (guildId: string, config: AutomodConfig) =>
    request(`/guilds/${guildId}/moderation`, { method: "PUT", body: JSON.stringify(config) }),

  getEvents: (guildId: string) => request<EventRow[]>(`/guilds/${guildId}/events`),
  createEvent: (guildId: string, body: Record<string, unknown>) =>
    request<EventRow>(`/guilds/${guildId}/events`, { method: "POST", body: JSON.stringify(body) }),

  getLeaderboard: (guildId: string) => request<LeaderboardRow[]>(`/guilds/${guildId}/leaderboard`),

  getCommands: (guildId: string) => request<CustomCommand[]>(`/guilds/${guildId}/commands`),
  addCommand: (guildId: string, trigger: string, response: string) =>
    request<CustomCommand>(`/guilds/${guildId}/commands`, {
      method: "POST",
      body: JSON.stringify({ trigger, response }),
    }),
  deleteCommand: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/commands/${id}`, { method: "DELETE" }),

  getStreamSubscriptions: (guildId: string) =>
    request<StreamSubscription[]>(`/guilds/${guildId}/stream-subscriptions`),
  addStreamSubscription: (
    guildId: string,
    body: { platform: "twitch" | "youtube"; channelName: string; announceChannelId: string }
  ) =>
    request<StreamSubscription>(`/guilds/${guildId}/stream-subscriptions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteStreamSubscription: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/stream-subscriptions/${id}`, { method: "DELETE" }),

  getDiscordChannels: (guildId: string) => request<DiscordChannels>(`/guilds/${guildId}/discord/channels`),
  getDiscordRoles: (guildId: string) => request<DiscordRoleOption[]>(`/guilds/${guildId}/discord/roles`),

  getLogging: (guildId: string) => request<LoggingConfig>(`/guilds/${guildId}/logging`),
  setLogging: (guildId: string, config: Partial<LoggingConfig>) =>
    request<LoggingConfig>(`/guilds/${guildId}/logging`, { method: "PUT", body: JSON.stringify(config) }),

  getAntiRaid: (guildId: string) => request<AntiRaidConfig>(`/guilds/${guildId}/anti-raid`),
  setAntiRaid: (guildId: string, config: Partial<AntiRaidConfig>) =>
    request<AntiRaidConfig>(`/guilds/${guildId}/anti-raid`, { method: "PUT", body: JSON.stringify(config) }),

  getReactionRoles: (guildId: string) => request<ReactionRoleRow[]>(`/guilds/${guildId}/reaction-roles`),
  addReactionRole: (guildId: string, body: { channelId: string; messageId: string; emoji: string; roleId: string }) =>
    request<ReactionRoleRow>(`/guilds/${guildId}/reaction-roles`, { method: "POST", body: JSON.stringify(body) }),
  deleteReactionRole: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/reaction-roles/${id}`, { method: "DELETE" }),

  getJoinRoles: (guildId: string) => request<JoinRoleRow[]>(`/guilds/${guildId}/join-roles`),
  addJoinRole: (guildId: string, roleId: string) =>
    request<JoinRoleRow>(`/guilds/${guildId}/join-roles`, { method: "POST", body: JSON.stringify({ roleId }) }),
  deleteJoinRole: (guildId: string, id: string) => request(`/guilds/${guildId}/join-roles/${id}`, { method: "DELETE" }),

  getStickyMessages: (guildId: string) => request<StickyMessageRow[]>(`/guilds/${guildId}/sticky-messages`),
  addStickyMessage: (guildId: string, channelId: string, content: string) =>
    request<StickyMessageRow>(`/guilds/${guildId}/sticky-messages`, { method: "POST", body: JSON.stringify({ channelId, content }) }),
  deleteStickyMessage: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/sticky-messages/${id}`, { method: "DELETE" }),

  getStarboard: (guildId: string) => request<StarboardConfig>(`/guilds/${guildId}/starboard`),
  setStarboard: (guildId: string, config: Partial<StarboardConfig>) =>
    request<StarboardConfig>(`/guilds/${guildId}/starboard`, { method: "PUT", body: JSON.stringify(config) }),

  getTempChannelLobbies: (guildId: string) => request<TempChannelLobbyRow[]>(`/guilds/${guildId}/temp-channels/lobbies`),
  addTempChannelLobby: (guildId: string, body: Partial<TempChannelLobbyRow>) =>
    request<TempChannelLobbyRow>(`/guilds/${guildId}/temp-channels/lobbies`, { method: "POST", body: JSON.stringify(body) }),
  updateTempChannelLobby: (guildId: string, id: string, body: Partial<TempChannelLobbyRow>) =>
    request<TempChannelLobbyRow>(`/guilds/${guildId}/temp-channels/lobbies/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTempChannelLobby: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/temp-channels/lobbies/${id}`, { method: "DELETE" }),

  getTicketPanels: (guildId: string) => request<TicketPanelRow[]>(`/guilds/${guildId}/ticket-panels`),
  addTicketPanel: (guildId: string, body: Partial<TicketPanelRow>) =>
    request<TicketPanelRow>(`/guilds/${guildId}/ticket-panels`, { method: "POST", body: JSON.stringify(body) }),
  deleteTicketPanel: (guildId: string, id: string) => request(`/guilds/${guildId}/ticket-panels/${id}`, { method: "DELETE" }),
  getTickets: (guildId: string) => request<TicketRow[]>(`/guilds/${guildId}/tickets`),

  getGiveaways: (guildId: string) => request<GiveawayRow[]>(`/guilds/${guildId}/giveaways`),
  addGiveaway: (guildId: string, body: { channelId: string; prize: string; winnerCount: number; endsAt: string }) =>
    request<GiveawayRow>(`/guilds/${guildId}/giveaways`, { method: "POST", body: JSON.stringify(body) }),

  getEconomyConfig: (guildId: string) => request<EconomyConfig>(`/guilds/${guildId}/economy/config`),
  setEconomyConfig: (guildId: string, config: Partial<EconomyConfig>) =>
    request<EconomyConfig>(`/guilds/${guildId}/economy/config`, { method: "PUT", body: JSON.stringify(config) }),
  getEconomyLeaderboard: (guildId: string) => request<EconomyBalanceRow[]>(`/guilds/${guildId}/economy/leaderboard`),

  getVerification: (guildId: string) => request<VerificationConfig>(`/guilds/${guildId}/verification`),
  setVerification: (guildId: string, config: Partial<VerificationConfig>) =>
    request<VerificationConfig>(`/guilds/${guildId}/verification`, { method: "PUT", body: JSON.stringify(config) }),

  getAntiNuke: (guildId: string) => request<AntiNukeConfig>(`/guilds/${guildId}/anti-nuke`),
  setAntiNuke: (guildId: string, config: Partial<AntiNukeConfig>) =>
    request<AntiNukeConfig>(`/guilds/${guildId}/anti-nuke`, { method: "PUT", body: JSON.stringify(config) }),

  getHoneypot: (guildId: string) => request<HoneypotConfig>(`/guilds/${guildId}/honeypot`),
  setHoneypot: (guildId: string, config: Partial<HoneypotConfig>) =>
    request<HoneypotConfig>(`/guilds/${guildId}/honeypot`, { method: "PUT", body: JSON.stringify(config) }),

  getLevelRoles: (guildId: string) => request<LevelRoleRow[]>(`/guilds/${guildId}/level-roles`),
  addLevelRole: (guildId: string, level: number, roleId: string) =>
    request<LevelRoleRow>(`/guilds/${guildId}/level-roles`, { method: "POST", body: JSON.stringify({ level, roleId }) }),
  deleteLevelRole: (guildId: string, id: string) => request(`/guilds/${guildId}/level-roles/${id}`, { method: "DELETE" }),

  getCountingGame: (guildId: string) => request<CountingGameConfig>(`/guilds/${guildId}/counting-game`),
  setCountingGame: (guildId: string, config: Partial<CountingGameConfig>) =>
    request<CountingGameConfig>(`/guilds/${guildId}/counting-game`, { method: "PUT", body: JSON.stringify(config) }),

  getCases: (guildId: string) =>
    request<Array<{ caseNumber: number; userId: string; action: string; reason: string | null; moderatorId: string; createdAt: string }>>(
      `/guilds/${guildId}/cases`
    ),

  getReports: (guildId: string) =>
    request<Array<{ id: string; reporterId: string; reportedUserId: string; reason: string; status: string; createdAt: string }>>(
      `/guilds/${guildId}/reports`
    ),
  setReportStatus: (guildId: string, id: string, status: string) =>
    request(`/guilds/${guildId}/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  getPartnerships: (guildId: string) =>
    request<Array<{ id: string; partnerName: string; partnerInvite: string | null; type: string; since: string }>>(
      `/guilds/${guildId}/partnerships`
    ),
  addPartnership: (guildId: string, body: { partnerName: string; partnerInvite?: string; type: string }) =>
    request(`/guilds/${guildId}/partnerships`, { method: "POST", body: JSON.stringify(body) }),
  deletePartnership: (guildId: string, id: string) => request(`/guilds/${guildId}/partnerships/${id}`, { method: "DELETE" }),

  getPermWatch: (guildId: string) => request<{ guildId: string; alertChannelId: string | null }>(`/guilds/${guildId}/perm-watch`),
  setPermWatch: (guildId: string, alertChannelId: string) =>
    request(`/guilds/${guildId}/perm-watch`, { method: "PUT", body: JSON.stringify({ alertChannelId }) }),
};
