import type { EmbedExtra } from "./embedExtra";

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

  // A single choke point for "your session is no longer valid" — expired
  // (24h token lifetime) or revoked (owner pulled your dashboard access) —
  // so every page gets a clean redirect to a real login screen instead of
  // each one needing its own 401 handling (previously inconsistent: some
  // pages caught it, most didn't).
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = "/?expired=1";
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body && typeof body.error === "string" && body.error) || `API ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Separate from request() because a file upload must let the browser set
// its own multipart boundary in Content-Type — request() always forces
// application/json.
async function uploadFile(path: string, file: File): Promise<{ url: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body && typeof body.error === "string" && body.error) || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export interface ModuleState {
  enabled: boolean;
  config: Record<string, unknown> | null;
}

export interface DashboardActivityEntry {
  id: string;
  userId: string;
  username: string;
  method: string;
  path: string;
  createdAt: string;
}

export interface WelcomeConfig {
  guildId: string;
  channelId: string | null;
  welcomeText: string;
  goodbyeText: string;
  embedColor: string;
  embedEnabled: boolean;
  embedTitle: string | null;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}

export interface WelcomeGreetingRow {
  id: string;
  text: string;
  buttonLabel: string;
  enabled: boolean;
  sortOrder: number;
}

export interface AutomodConfig {
  bannedWordsEnabled: boolean;
  bannedWords: string[];
  repeatedTextEnabled: boolean;
  serverInvitesEnabled: boolean;
  externalLinksEnabled: boolean;
  excessiveCapsEnabled: boolean;
  excessiveEmojisEnabled: boolean;
  excessiveSpoilersEnabled: boolean;
  excessiveMentionsEnabled: boolean;
  immuneRoleIds: string[];
  zalgoEnabled: boolean;
  antiSpamEnabled: boolean;
}

export interface CustomCommand {
  id: string;
  trigger: string;
  response: string;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedColor: string | null;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}

export interface StreamSubscription {
  id: string;
  platform: "twitch" | "youtube";
  channelName: string;
  announceChannelId: string;
  isLive: boolean;
}

export type RsvpRole = "TANK" | "DPS" | "HEALER" | "ATTENDING" | "ABSENT";

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  channelId: string;
  startTime: string;
  status: string;
  reminderMinutesBefore: number;
  embedEnabled: boolean;
  embedColor: string | null;
  buttons: StickyButton[];
  enabledRoles: RsvpRole[];
  signups: Array<{ userId: string; role: string }>;
  embedExtra?: EmbedExtra;
}
export interface EventInput {
  title: string;
  description: string;
  channelId: string;
  startTime: string;
  reminderMinutesBefore: number;
  embedEnabled: boolean;
  embedColor: string;
  buttons: StickyButton[];
  enabledRoles: RsvpRole[];
  embedExtra?: EmbedExtra;
}

export interface EventTemplateRow {
  id: string;
  name: string;
  title: string;
  description: string | null;
  reminderMinutesBefore: number;
  embedEnabled: boolean;
  embedColor: string | null;
  buttons: StickyButton[];
  enabledRoles: RsvpRole[];
  embedExtra?: EmbedExtra;
}
export interface EventTemplateInput {
  name: string;
  title: string;
  description: string;
  reminderMinutesBefore: number;
  embedEnabled: boolean;
  embedColor: string;
  buttons: StickyButton[];
  enabledRoles: RsvpRole[];
  embedExtra?: EmbedExtra;
}

export interface EventSettingsRow {
  guildId: string;
  defaultChannelId: string | null;
  defaultReminder: number;
  mentionRoleId: string | null;
}

export interface ButtonPresetRow {
  id: string;
  name: string;
  buttons: StickyButton[];
}

export interface SavedEmbedRow {
  id: string;
  name: string;
  content: string | null;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
}
export interface SavedEmbedInput {
  name: string;
  content: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
}

export interface StatChannelRow {
  id: string;
  channelId: string;
  statType: "MEMBER_COUNT" | "BOOST_COUNT" | "CHANNEL_COUNT";
  format: string;
}

export interface StatusChannelRow {
  id: string;
  channelId: string;
}

export interface GrowthSnapshotRow {
  id: string;
  guildId: string;
  memberCount: number;
  messageCount: number;
  createdAt: string;
}

export interface AiConfigRow {
  guildId: string;
  chatChannelId: string | null;
  chatSystemPrompt: string | null;
  moderationEnabled: boolean;
}

export interface ServerBackupRow {
  id: string;
  name: string;
  createdAt: string;
  roleCount: number;
  channelCount: number;
}

export interface CommandToggleRow {
  name: string;
  description: string;
  moduleKey: string | null;
  enabled: boolean;
}

export type LfgMode = "plain" | "embed";

export interface LfgCategoryRow {
  id: string;
  name: string;
  channelId: string;
  roleId: string | null;
  message: string | null;
  sortOrder: number;
}
export interface LfgCategoryInput {
  name: string;
  roleId?: string | null;
  message?: string | null;
}

export interface LfgCommandRow {
  id: string;
  trigger: string;
  description: string;
  channelId: string;
  roleId: string | null;
  includeSender: boolean;
  enabled: boolean;
  mode: LfgMode;
  message: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
  errorMessage: string;
  wrongChannelMessage: string;
  categories: LfgCategoryRow[];
}
export interface LfgCommandInput {
  trigger: string;
  description?: string;
  channelId: string;
  roleId?: string | null;
  includeSender?: boolean;
  enabled?: boolean;
  mode?: LfgMode;
  message?: string | null;
  embedTitle?: string | null;
  embedDescription?: string | null;
  embedColor?: string | null;
  embedExtra?: EmbedExtra | null;
  savedEmbedId?: string | null;
  errorMessage?: string;
  wrongChannelMessage?: string;
}

// ---- Embed Creator ----
export interface EmbedCreatorField {
  name: string;
  value: string;
  inline?: boolean;
}
export interface EmbedCreatorEmbed {
  id: string;
  authorName?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  title?: string;
  titleUrl?: string;
  description?: string;
  color?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  fields: EmbedCreatorField[];
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
}
export type EmbedActionType = "none" | "give_role" | "remove_role" | "toggle_role" | "add_currency" | "send_message" | "post_embed" | "self_role" | "send_embed_to_channel";
export interface EmbedActionConfig {
  type: EmbedActionType;
  roleId?: string;
  currencyAmount?: number;
  messageText?: string;
  embedPresetId?: string;
  ephemeral?: boolean;
}
export type EmbedCreatorButtonItem =
  | { id: string; kind: "button"; label: string; style: "primary" | "secondary" | "success" | "danger"; action?: EmbedActionConfig }
  | { id: string; kind: "link"; label: string; url: string };
export interface EmbedSelectOption {
  id: string;
  label: string;
  value: string;
  action?: EmbedActionConfig;
}
export interface EmbedCreatorComponentRow {
  id: string;
  type: "buttons" | "string" | "user" | "role" | "user_role" | "channel" | null;
  placeholder?: string;
  items: EmbedCreatorButtonItem[];
  options?: EmbedSelectOption[]; // string select's configurable choices
  action?: EmbedActionConfig; // user/role/channel/user_role select's single action
  defaultValueId?: string; // pre-selects a role/channel/user in the picker
}
export interface EmbedCreatorState {
  content: string;
  deliveryMode: "bot" | "webhook";
  channelId: string;
  webhookUrl: string;
  profileName: string;
  profileAvatar: string;
  embeds: EmbedCreatorEmbed[];
  components: EmbedCreatorComponentRow[];
}
export interface EmbedCreatorPresetRow {
  id: string;
  name: string;
  data: EmbedCreatorState;
  lastSentMode: "bot" | "webhook" | null;
  lastSentChannelId: string | null;
  lastSentWebhookUrl: string | null;
  lastSentMessageId: string | null;
  createdAt: string;
  // present on the save response: which live Discord messages were refreshed
  sync?: { updated: number; failed: number; places: string[]; failures?: string[] };
}
export interface EmbedCreatorSendInput {
  mode: "bot" | "webhook";
  channelId?: string;
  webhookUrl?: string;
  profileName?: string;
  profileAvatar?: string;
  content?: string;
  embeds: EmbedCreatorEmbed[];
  components: EmbedCreatorComponentRow[];
  presetId?: string;
}
export interface EmbedCreatorFetchResult {
  channelId: string;
  messageId: string;
  content: string;
  embeds: EmbedCreatorEmbed[];
}

export type CustomCommandActionType = "SEND_MESSAGE" | "GIVE_ROLE" | "REMOVE_ROLE" | "ADD_CURRENCY" | "POST_EMBED";

export interface CustomSlashCommandRow {
  id: string;
  name: string;
  description: string;
  actionType: CustomCommandActionType;
  ephemeralReply: boolean;
  messageText: string | null;
  roleId: string | null;
  currencyAmount: number | null;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}
export interface CustomSlashCommandInput {
  name: string;
  description: string;
  actionType: CustomCommandActionType;
  ephemeralReply: boolean;
  messageText?: string;
  roleId?: string;
  currencyAmount?: number;
  embedEnabled?: boolean;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
  buttons?: StickyButton[];
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}

export interface SendMessageInput {
  channelId: string;
  content: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
}

export interface LeaderboardRow {
  userId: string;
  xp: number;
  level: number;
  username: string | null;
  nickname: string | null;
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
export interface DiscordMemberOption {
  id: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
}

export interface LoggingConfig {
  guildId: string;
  logChannelId: string | null;

  // Moderation Events
  logMemberMuted: boolean;
  logMemberUnmuted: boolean;
  logModerationBan: boolean;
  logModerationUnban: boolean;

  // Message Events
  logEdits: boolean;
  logDeletes: boolean;
  logInvitePosted: boolean;

  // Member Events
  logNicknameChanged: boolean;
  logMemberBanned: boolean;
  logJoinsLeaves: boolean;
  logMemberUnbanned: boolean;
  logUserUpdated: boolean;

  // Role Events
  logRoleCreated: boolean;
  logRoleUpdated: boolean;
  logRoleDeleted: boolean;
  logMemberRolesChanged: boolean;

  // Voice Events
  logVoice: boolean;

  // Server Events
  logServerEdited: boolean;
  logEmojisUpdated: boolean;

  // Channel Events
  logChannelCreated: boolean;
  logChannelUpdated: boolean;
  logChannelDeleted: boolean;

  // Ignored / Additional settings
  ignoredChannelIds: string[];
  ignoreBots: boolean;
  hideThumbnails: boolean;
}

export interface AntiRaidConfig {
  guildId: string;
  alertChannelId: string | null;
  joinRateLimit: number;
  joinRateWindowSec: number;
  minAccountAgeDays: number;
  autoLockdown: boolean;
}

export type NotifyMode = "PRIVATE" | "DM" | "NONE";

export interface ReactionRoleOption {
  id: string;
  emoji: string;
  roleId: string;
  extraRoleIds?: string[];
  channelIds?: string[];
}
export interface DiscordEmojiOption {
  id: string;
  name: string;
  animated: boolean;
  token: string;
}
export interface ReactionRolePanelRow {
  id: string;
  channelId: string;
  messageId: string | null;
  title: string | null;
  description: string | null;
  embedEnabled: boolean;
  embedColor: string | null;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
  notifyMode?: NotifyMode;
  options: ReactionRoleOption[];
}
export interface ReactionRolePanelInput {
  channelId: string;
  title?: string;
  description?: string;
  embedEnabled?: boolean;
  embedColor?: string;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
  notifyMode?: NotifyMode;
  options: Array<{ emoji: string; roleIds: string[]; channelIds: string[] }>;
}

export interface JoinRoleRow {
  id: string;
  roleId: string;
}

export interface StickyButton {
  label: string;
  url: string;
}
export interface StickyMessageRow {
  id: string;
  channelId: string;
  content: string;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}
export interface StickyMessageInput {
  content: string;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
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

export type RolePanelLayout = "BUTTONS" | "DROPDOWN";

export interface RolePanelOption {
  roleId?: string; // legacy single-role shape
  roleIds?: string[];
  channelIds?: string[];
  label: string;
  emoji?: string;
}

export interface RolePanelRow {
  id: string;
  name: string;
  channelId: string;
  description: string | null;
  layout: RolePanelLayout;
  options: RolePanelOption[];
  messageId: string | null;
  embedEnabled: boolean;
  embedColor: string | null;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
  notifyMode?: NotifyMode;
}

export interface AnnouncementRow {
  id: string;
  channelId: string;
  content: string | null;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: StickyButton[];
  scheduledFor: string | null;
  sentAt: string | null;
  messageId: string | null;
  createdAt: string;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
  creatorData?: Pick<EmbedCreatorState, "content" | "embeds" | "components"> | null;
}
// What the Embed Creator-style composer saves.
export interface AnnouncementComposeInput {
  channelId: string;
  creatorData: Pick<EmbedCreatorState, "content" | "embeds" | "components">;
  savedEmbedId: string | null;
  scheduledFor: string | null;
}
export interface AnnouncementInput {
  channelId: string;
  content: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttons: StickyButton[];
  scheduledFor: string | null;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}

export interface AutoPurgeConfigRow {
  id: string;
  channelId: string;
  intervalSeconds: number;
  ignorePinned: boolean;
  ignoreImages: boolean;
  ignoreLinks: boolean;
  protectedEmojis: string[];
  lastRunAt: string | null;
}

export interface SlowModeChannelRow {
  id: string;
  name: string;
  rateLimitPerUser: number;
}

export interface BirthdayConfigRow {
  guildId: string;
  channelId: string | null;
  embedTitle: string | null;
  embedMessage: string | null;
  embedColor: string | null;
  pingRoleId: string | null;
  useButton: boolean;
  buttonChannelId: string | null;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}

export interface BirthdayRow {
  id: string;
  userId: string;
  month: number;
  day: number;
}

export type ApplicationPanelLayout = "BUTTONS" | "DROPDOWN";

export interface ApplicationPanelRow {
  id: string;
  name: string;
  channelId: string;
  description: string | null;
  layout: ApplicationPanelLayout;
  typeIds: string[];
  messageId: string | null;
  paused: boolean;
  savedEmbedId: string | null;
}

export interface ApplicationQuestion {
  label: string;
  style: "SHORT" | "PARAGRAPH";
  required: boolean;
}

export interface ApplicationCustomResponse {
  label: string;
  message: string;
}

export interface ApplicationTypeRow {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  reviewChannelId: string | null;
  staffRoleIds: string[];
  questions: ApplicationQuestion[];
  introMessage: string | null;
  submittedMessage: string | null;
  acceptMessage: string | null;
  denyMessage: string | null;
  customResponses: ApplicationCustomResponse[];
  enabled: boolean;
}

export type ApplicationStatus = "PENDING" | "ACCEPTED" | "DENIED";

export interface ApplicationRow {
  id: string;
  panelId: string;
  typeId: string | null;
  userId: string;
  answers: Array<{ label: string; answer: string }>;
  status: ApplicationStatus;
  reviewedBy: string | null;
  createdAt: string;
}

export interface ApplicationCounts {
  pending: number;
  accepted: number;
  denied: number;
}

export interface ApplicationSettingsRow {
  guildId: string;
  logChannelId: string | null;
  supportRoleIds: string[];
}

export type SupportQuestionMode = "TEXT" | "CHOICE";

export interface SupportQuestionRow {
  id: string;
  flowId: string;
  prompt: string;
  mode: SupportQuestionMode;
  choices: string[];
  sortOrder: number;
}

export interface SupportFlowRow {
  id: string;
  guildId: string;
  label: string;
  color: string | null;
  categoryId: string | null;
  roleId: string | null;
  enabled: boolean;
  sortOrder: number;
  questions: SupportQuestionRow[];
}

export type SupportTicketStatus = "DRAFT" | "OPEN" | "CLAIMED" | "CLOSED";

export interface SupportTranscriptEntry {
  from: "member" | "staff" | "system";
  authorTag: string;
  content: string;
  at: string;
}

export interface SupportTicketRow {
  id: string;
  flowId: string;
  userId: string;
  channelId: string | null;
  answers: Array<{ prompt: string; answer: string }>;
  transcript: SupportTranscriptEntry[];
  status: SupportTicketStatus;
  claimedById: string | null;
  createdAt: string;
  closedAt: string | null;
  flow?: { label: string };
}

export interface SupportSettingsRow {
  guildId: string;
  introMessage: string | null;
  noFlowsMessage: string | null;
  alreadyOpenMessage: string | null;
  ticketOpenedMessage: string | null;
  ticketClaimedMessage: string | null;
  ticketClosedMessage: string | null;
}

export type TicketPanelLayout = "BUTTONS" | "DROPDOWN";

export interface TicketPanelRow {
  id: string;
  name: string;
  channelId: string;
  layout: TicketPanelLayout;
  typeIds: string[];
  description: string | null;
  paused: boolean;
  messageId: string | null;
  categoryId: string | null;
  buttonLabel: string;
  supportRoleId: string | null;
  savedEmbedId: string | null;
}

export interface TicketModalField {
  label: string;
  placeholder?: string;
  required?: boolean;
  style?: "SHORT" | "PARAGRAPH";
}

export type TicketCloseBehavior = "DELETE_AND_DM" | "POST_ONLY";

export interface TicketTypeRow {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  categoryId: string | null;
  staffRoleIds: string[];
  openMessage: string | null;
  modalFields: TicketModalField[];
  autoCloseHours: number | null;
  slaMinutes: number | null;
  enabled: boolean;
  transcriptChannelId: string | null;
  closeBehavior: TicketCloseBehavior | null;
}

export type TicketStatus = "OPEN" | "CLAIMED" | "CLOSED";

export interface TicketRow {
  id: string;
  panelId: string;
  typeId: string | null;
  ticketNumber: number;
  channelId: string;
  userId: string;
  status: TicketStatus;
  claimedById: string | null;
  priority: string | null;
  tags: string[];
  closeReason: string | null;
  transcriptUrl: string | null;
  feedbackRating: number | null;
  createdAt: string;
  closedAt: string | null;
}

export interface TicketCounts {
  open: number;
  claimed: number;
  closed: number;
  archived: number;
}

export interface TicketTagRow {
  id: string;
  name: string;
  color: string;
}

export interface TicketCannedResponseRow {
  id: string;
  title: string;
  content: string;
}

export interface TicketKnowledgeBaseRow {
  id: string;
  name: string;
  content: string;
}

export interface TicketSettingsRow {
  guildId: string;
  logChannelId: string | null;
  transcriptChannelId: string | null;
  closeBehavior: TicketCloseBehavior;
  channelNameFormat: string;
  ticketCap: number;
  requireCloseReason: boolean;
  supportRoleIds: string[];
  blacklistUserIds: string[];
  blacklistRoleIds: string[];
}

export interface TicketAnalytics {
  opened: number;
  closed: number;
  currentlyOpen: number;
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
  byType: Array<{ typeId: string; name: string; count: number }>;
  staffLeaderboard: Array<{ userId: string; count: number }>;
  avgFeedback: number | null;
  feedbackCount: number;
}

export interface GiveawayRow {
  id: string;
  channelId: string;
  prize: string;
  description: string | null;
  embedColor: string | null;
  imageUrl: string | null;
  buttons: StickyButton[];
  winnerCount: number;
  endsAt: string;
  ended: boolean;
  entries: Array<{ userId: string }>;
  embedExtra?: EmbedExtra;
  savedEmbedId?: string | null;
}
export interface GiveawayInput {
  channelId: string;
  prize: string;
  description?: string;
  embedColor?: string;
  imageUrl?: string;
  embedExtra?: EmbedExtra;
  buttons?: StickyButton[];
  winnerCount: number;
  endsAt: string;
  savedEmbedId?: string | null;
}

export type PollDurationMode = "TIMER" | "MANUAL";
export type PollResultsStyle = "BARS" | "SIMPLE";
export type PollBarStyle = "CLASSIC" | "SOLID";

export interface PollRow {
  id: string;
  channelId: string;
  messageId: string | null;
  question: string;
  options: string[];
  emojis: string[];
  allowMultiselect: boolean;
  color: string | null;
  barColor: string | null;
  barColorSecondary: string | null;
  resultsStyle: PollResultsStyle;
  barStyle: PollBarStyle;
  isPrivate: boolean;
  durationMode: PollDurationMode;
  endsAt: string | null;
  closed: boolean;
  closedAt: string | null;
  allowWriteIn: boolean;
  allowLockIn: boolean;
  createdAt: string;
  votes: Array<{ userId: string; emoji: string }>;
  writeIns: Array<{ id: string; userId: string; text: string; createdAt: string }>;
  submissions: Array<{ userId: string; submittedAt: string }>;
}

export interface PollInput {
  channelId: string;
  question: string;
  options: string[];
  emojis: string[];
  allowMultiselect?: boolean;
  color?: string;
  barColor?: string;
  barColorSecondary?: string;
  resultsStyle?: PollResultsStyle;
  barStyle?: PollBarStyle;
  isPrivate?: boolean;
  durationMode: PollDurationMode;
  hours?: number;
  minutes?: number;
  allowWriteIn?: boolean;
  allowLockIn?: boolean;
}

export interface EconomyMultiplier {
  channelId?: string;
  roleId?: string;
  multiplier: number;
}

export interface EconomyConfig {
  guildId: string;
  currencyName: string;
  currencyIcon: string;
  embedColor: string;
  maxBalance: number;
  earnOnMessages: boolean;
  messageEarnMin: number;
  messageEarnMax: number;
  messageCooldownSec: number;
  minMessageLength: number;
  dailyEnabled: boolean;
  dailyAmount: number;
  streakBonusPerDay: number;
  streakCapDays: number;
  transfersEnabled: boolean;
  transferMinAmount: number;
  transferTaxPercent: number;
  channelMultipliers: EconomyMultiplier[];
  roleMultipliers: EconomyMultiplier[];
  maxBet: number;
}
export interface EconomyBalanceRow {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
}
export interface EconomyAnalytics {
  totalHeld: number;
  activeMembers: number;
  earned: number;
  removed: number;
  concentration: { top5: number; top10: number; top50: number };
  topEarners: Array<{ userId: string; totalEarned: number; balance: number }>;
}
export interface VerificationConfig {
  guildId: string;
  verifiedRoleId: string | null;
  minAccountAgeDays: number;
  panelChannelId: string | null;
  savedEmbedId: string | null;
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
export interface ChannelLockRow {
  id: string;
  channelId: string;
  allowImages: boolean;
  allowLinks: boolean;
  allowFiles: boolean;
  allowMessages: boolean;
  slashCommandsOnly: boolean;
  allowedCommands: string[];
  requiredPrefixes: string[];
  bannedWords: string[];
  allowedUserIds: string[];
  allowedRoleIds: string[];
  notifyEnabled: boolean;
  notifyContent: string | null;
}
export interface ChannelLockInput {
  allowImages: boolean;
  allowLinks: boolean;
  allowFiles: boolean;
  allowMessages: boolean;
  slashCommandsOnly: boolean;
  allowedCommands: string[];
  requiredPrefixes: string[];
  bannedWords: string[];
  allowedUserIds: string[];
  allowedRoleIds: string[];
  notifyEnabled: boolean;
  notifyContent: string | null;
}

export function buildBotInviteUrl(clientId: string, guildId?: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: "8", // Administrator — simplest option given how many modules touch roles/channels/messages
  });
  if (guildId) params.set("guild_id", guildId);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export interface BotConfigRow {
  id: string;
  clientId: string | null;
  username: string | null;
  avatarUrl: string | null;
  description: string | null;
  statusType: "online" | "idle" | "dnd" | "invisible";
  activityType: "PLAYING" | "WATCHING" | "LISTENING" | "COMPETING" | "CUSTOM";
  activityText: string | null;
  manualStatusOverride: "ONLINE" | "OFFLINE" | "MAINTENANCE" | null;
  manualStatusMessage: string | null;
  supportServerPickerMessage: string | null;
}
export interface BotConfigInput {
  username?: string;
  avatarDataUri?: string;
  description?: string;
  statusType?: string;
  activityType?: string;
  activityText?: string;
  manualStatusOverride?: "ONLINE" | "OFFLINE" | "MAINTENANCE" | null;
  manualStatusMessage?: string | null;
  supportServerPickerMessage?: string | null;
}

export interface BotStatusRow {
  online: boolean;
  updating: boolean;
  manual: boolean;
  message: string | null;
  lastHeartbeatAt: string | null;
  lastError: { message: string; source: string; createdAt: string } | null;
  dashboardDeployingSince?: string | null; // set while a new dashboard version is building on Vercel
}

export interface AlertSettingsRow {
  errorChannelId: string | null;
  errorPingRoleId: string | null;
  errorPingUserId: string | null;
  deployChannelId: string | null;
  uptimeChannelId: string | null;
  botUpdatesChannelId: string | null;
}

export interface WarnEscalationSettingsRow {
  warnThreshold: number;
  warnWindowDays: number;
  action: "TIMEOUT" | "KICK" | "BAN";
  timeoutMinutes: number;
  scaleDuration: boolean;
}

export interface PrestigeSettingsRow {
  maxLevel: number;
  roleId: string | null;
}

export interface BumpReminderSettingsRow {
  channelId: string | null;
  mentionRoleId: string | null;
  nextReminderAt: string | null;
}

export interface RulesGateSettingsRow {
  channelId: string | null;
  roleId: string | null;
  savedEmbedId: string | null;
  roleToRemoveId: string | null;
  logChannelId: string | null;
  dmConfirmEnabled: boolean;
  dmConfirmMessage: string | null;
  agreeReplyMessage: string | null;
  alreadyAgreedMessage: string | null;
  noRoleConfiguredMessage: string | null;
  rulesVersion: number;
  minAccountAgeDays: number | null;
  accountTooNewMessage: string | null;
  declineEnabled: boolean;
  declineAction: "NONE" | "KICK" | "CHANNEL";
  declineChannelId: string | null;
  declineReplyMessage: string | null;
  reminderEnabled: boolean;
  reminderDelayHours: number;
  reminderMessage: string | null;
  reminderRepeatEnabled: boolean;
  reminderRepeatWeekday: number | null;
  reminderRepeatHour: number | null;
  defaultEmbedTitle: string | null;
  defaultEmbedDescription: string | null;
}

export interface RulesGateAgreementRow {
  id: string;
  userId: string;
  username: string;
  roleId: string | null;
  agreedAt: string;
  version: number;
  sectionId: string | null;
}

export interface RulesGateSectionRow {
  id: string;
  label: string;
  roleId: string;
  sortOrder: number;
}

export interface SuggestionAnalyticsSettingsRow {
  channelId: string | null;
}

export interface ConfessionSettingsRow {
  channelId: string | null;
  nextNumber: number;
}

export interface MilestoneSettingsRow {
  channelId: string | null;
}

export interface AppealSettingsRow {
  appealChannelId: string | null;
}

export interface AppealRow {
  id: string;
  guildId: string;
  userId: string;
  caseId: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  messageId: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReportSettingsRow {
  staffRoleId: string | null;
  categoryId: string | null;
  channelNameFormat: string;
  panelChannelId: string | null;
  savedEmbedId: string | null;
  dmCreateEnabled: boolean;
  dmCreateMessage: string | null;
  dmClaimEnabled: boolean;
  dmClaimMessage: string | null;
  dmCloseEnabled: boolean;
  dmCloseMessage: string | null;
}

export interface ModDigestSettingsRow {
  channelId: string | null;
  frequency: "DAILY" | "WEEKLY";
  dayOfWeek: number;
  hourUtc: number;
  staffRoleIds: string[];
  lastSentAt: string | null;
}

export interface WeeklyRecapSettingsRow {
  channelId: string | null;
}

export interface ErrorLogRow {
  id: string;
  source: string;
  message: string;
  stack: string | null;
  createdAt: string;
}

export interface CountingGameConfig {
  guildId: string;
  channelId: string | null;
  currentCount: number;
  resetOnMistake: boolean;
  highScore: number;
}

export interface VoiceActivityRow {
  id: string;
  userId: string;
  totalMinutes: number;
}

export interface AchievementRow {
  id: string;
  userId: string;
  type: string;
  channelId: string | null;
  awardedAt: string;
}

export interface LevelingSettingsRow {
  guildId: string;
  channelId: string | null;
  levelUpMessage: string;
}

export interface ChangelogEntryRow {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface AchievementSettingsRow {
  guildId: string;
  channelId: string | null;
}

export type CustomAchievementTrigger = "LEVEL" | "VOICE_HOURS" | "DAILY_STREAK";

export interface CustomAchievementRow {
  id: string;
  name: string;
  emoji: string;
  triggerType: CustomAchievementTrigger;
  threshold: number;
  createdAt: string;
}
export interface CustomAchievementInput {
  name: string;
  emoji?: string;
  triggerType: CustomAchievementTrigger;
  threshold: number;
}

export interface CurrentUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface AccessStatus {
  status: "owner" | "approved" | "pending" | "none";
  plan: "FREE" | "PAID" | null;
  message: string | null;
}

export interface AccessRequestRow {
  id: string;
  discordUserId: string;
  username: string;
  message: string | null;
  requestedAt: string;
}

export interface DashboardAccessRow {
  id: string;
  discordUserId: string;
  username: string;
  plan: "FREE" | "PAID";
  grantedAt: string;
}

export interface AccessAuditEntryRow {
  id: string;
  discordUserId: string;
  username: string;
  action: "APPROVED" | "DENIED" | "GRANTED" | "REVOKED" | "PLAN_CHANGED" | "REVOKED_ALL";
  detail: string | null;
  createdAt: string;
}

export const api = {
  uploadImage: (guildId: string, file: File) => uploadFile(`/guilds/${guildId}/upload-image`, file),

  getMe: () => request<CurrentUser>("/me"),
  getGuilds: () =>
    request<Array<{ id: string; name: string; icon: string | null; botInstalled: boolean; owner: boolean }>>("/guilds"),

  getAccessStatus: () => request<AccessStatus>("/access-status"),
  requestAccess: (message?: string) =>
    request<AccessRequestRow>("/access-requests", { method: "POST", body: JSON.stringify({ message }) }),
  getAccessRequests: () => request<AccessRequestRow[]>("/access-requests"),
  approveAccessRequest: (id: string) => request<DashboardAccessRow>(`/access-requests/${id}/approve`, { method: "POST" }),
  denyAccessRequest: (id: string) => request(`/access-requests/${id}/deny`, { method: "POST" }),
  getDashboardAccess: () => request<DashboardAccessRow[]>("/dashboard-access"),
  grantDashboardAccess: (discordUserId: string, username: string) =>
    request<DashboardAccessRow>("/dashboard-access", { method: "POST", body: JSON.stringify({ discordUserId, username }) }),
  setDashboardAccessPlan: (id: string, plan: "FREE" | "PAID") =>
    request<DashboardAccessRow>(`/dashboard-access/${id}`, { method: "PATCH", body: JSON.stringify({ plan }) }),
  revokeDashboardAccess: (id: string) => request(`/dashboard-access/${id}`, { method: "DELETE" }),
  revokeAllDashboardAccess: () => request<{ revokedCount: number }>("/dashboard-access/revoke-all", { method: "POST" }),
  getAccessAuditLog: () => request<AccessAuditEntryRow[]>("/access-audit-log"),

  getModules: (guildId: string) => request<Record<string, ModuleState>>(`/guilds/${guildId}/modules`),
  getActivity: (guildId: string, limit = 20) => request<DashboardActivityEntry[]>(`/guilds/${guildId}/activity?limit=${limit}`),
  setModule: (guildId: string, key: string, enabled: boolean) =>
    request(`/guilds/${guildId}/modules/${key}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),

  getWelcome: (guildId: string) => request<WelcomeConfig>(`/guilds/${guildId}/welcome`),
  setWelcome: (guildId: string, config: Partial<WelcomeConfig>) =>
    request<WelcomeConfig>(`/guilds/${guildId}/welcome`, { method: "PUT", body: JSON.stringify(config) }),
  sendWelcomeTest: (guildId: string, kind: "welcome" | "goodbye") =>
    request<{ ok: boolean }>(`/guilds/${guildId}/welcome/send-test`, { method: "POST", body: JSON.stringify({ kind }) }),

  getWelcomeGreetings: (guildId: string) => request<WelcomeGreetingRow[]>(`/guilds/${guildId}/welcome-greetings`),
  addWelcomeGreeting: (guildId: string, body: Partial<WelcomeGreetingRow>) =>
    request<WelcomeGreetingRow>(`/guilds/${guildId}/welcome-greetings`, { method: "POST", body: JSON.stringify(body) }),
  updateWelcomeGreeting: (guildId: string, id: string, body: Partial<WelcomeGreetingRow>) =>
    request<WelcomeGreetingRow>(`/guilds/${guildId}/welcome-greetings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteWelcomeGreeting: (guildId: string, id: string) => request(`/guilds/${guildId}/welcome-greetings/${id}`, { method: "DELETE" }),

  getModeration: (guildId: string) =>
    request<{ enabled: boolean; config: AutomodConfig }>(`/guilds/${guildId}/moderation`),
  setModeration: (guildId: string, config: AutomodConfig) =>
    request(`/guilds/${guildId}/moderation`, { method: "PUT", body: JSON.stringify(config) }),

  getEvents: (guildId: string) => request<EventRow[]>(`/guilds/${guildId}/events`),
  createEvent: (guildId: string, body: EventInput) =>
    request<EventRow>(`/guilds/${guildId}/events`, { method: "POST", body: JSON.stringify(body) }),
  updateEvent: (guildId: string, id: string, body: Partial<EventInput>) =>
    request<EventRow>(`/guilds/${guildId}/events/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEvent: (guildId: string, id: string) => request(`/guilds/${guildId}/events/${id}`, { method: "DELETE" }),

  getEventTemplates: (guildId: string) => request<EventTemplateRow[]>(`/guilds/${guildId}/event-templates`),
  saveEventTemplate: (guildId: string, input: EventTemplateInput) =>
    request<EventTemplateRow>(`/guilds/${guildId}/event-templates`, { method: "POST", body: JSON.stringify(input) }),
  deleteEventTemplate: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/event-templates/${id}`, { method: "DELETE" }),

  getEventSettings: (guildId: string) => request<EventSettingsRow>(`/guilds/${guildId}/event-settings`),
  setEventSettings: (guildId: string, settings: Partial<EventSettingsRow>) =>
    request<EventSettingsRow>(`/guilds/${guildId}/event-settings`, { method: "PUT", body: JSON.stringify(settings) }),

  sendMessage: (guildId: string, input: SendMessageInput) =>
    request<{ ok: boolean }>(`/guilds/${guildId}/send-message`, { method: "POST", body: JSON.stringify(input) }),

  getButtonPresets: (guildId: string) => request<ButtonPresetRow[]>(`/guilds/${guildId}/button-presets`),
  saveButtonPreset: (guildId: string, name: string, buttons: StickyButton[]) =>
    request<ButtonPresetRow>(`/guilds/${guildId}/button-presets`, { method: "POST", body: JSON.stringify({ name, buttons }) }),
  deleteButtonPreset: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/button-presets/${id}`, { method: "DELETE" }),

  getSavedEmbeds: (guildId: string) => request<SavedEmbedRow[]>(`/guilds/${guildId}/saved-embeds`),
  saveSavedEmbed: (guildId: string, input: SavedEmbedInput) =>
    request<SavedEmbedRow>(`/guilds/${guildId}/saved-embeds`, { method: "POST", body: JSON.stringify(input) }),
  deleteSavedEmbed: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/saved-embeds/${id}`, { method: "DELETE" }),

  getStatChannels: (guildId: string) => request<StatChannelRow[]>(`/guilds/${guildId}/stat-channels`),
  addStatChannel: (guildId: string, channelId: string, statType: string, format: string) =>
    request<StatChannelRow>(`/guilds/${guildId}/stat-channels`, { method: "POST", body: JSON.stringify({ channelId, statType, format }) }),
  deleteStatChannel: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/stat-channels/${id}`, { method: "DELETE" }),

  getStatusChannels: (guildId: string) => request<StatusChannelRow[]>(`/guilds/${guildId}/status-channels`),
  addStatusChannel: (guildId: string, channelId: string) =>
    request<StatusChannelRow>(`/guilds/${guildId}/status-channels`, { method: "POST", body: JSON.stringify({ channelId }) }),
  deleteStatusChannel: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/status-channels/${id}`, { method: "DELETE" }),

  getGrowthSnapshots: (guildId: string) => request<GrowthSnapshotRow[]>(`/guilds/${guildId}/growth-snapshots`),

  cloneModules: (guildId: string, sourceGuildId: string) =>
    request<{ copied: number }>(`/guilds/${guildId}/clone-modules`, { method: "POST", body: JSON.stringify({ sourceGuildId }) }),

  getBotStatus: () => request<BotStatusRow>("/bot-status"),

  getAiConfig: (guildId: string) => request<AiConfigRow>(`/guilds/${guildId}/ai-config`),
  setAiConfig: (guildId: string, config: Partial<AiConfigRow>) =>
    request<AiConfigRow>(`/guilds/${guildId}/ai-config`, { method: "PUT", body: JSON.stringify(config) }),

  getServerBackups: (guildId: string) => request<ServerBackupRow[]>(`/guilds/${guildId}/backups`),
  createServerBackup: (guildId: string, name: string) =>
    request<ServerBackupRow>(`/guilds/${guildId}/backups`, { method: "POST", body: JSON.stringify({ name }) }),
  restoreServerBackup: (guildId: string, id: string) =>
    request<{ created: { roles: number; channels: number } }>(`/guilds/${guildId}/backups/${id}/restore`, { method: "POST" }),
  deleteServerBackup: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/backups/${id}`, { method: "DELETE" }),

  getCommandToggles: (guildId: string) => request<CommandToggleRow[]>(`/guilds/${guildId}/command-toggles`),
  setCommandToggle: (guildId: string, name: string, enabled: boolean) =>
    request(`/guilds/${guildId}/command-toggles/${name}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),

  getCustomSlashCommands: (guildId: string) => request<CustomSlashCommandRow[]>(`/guilds/${guildId}/custom-slash-commands`),
  createCustomSlashCommand: (guildId: string, input: CustomSlashCommandInput) =>
    request<CustomSlashCommandRow>(`/guilds/${guildId}/custom-slash-commands`, { method: "POST", body: JSON.stringify(input) }),
  deleteCustomSlashCommand: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/custom-slash-commands/${id}`, { method: "DELETE" }),

  getLfgCommands: (guildId: string) => request<LfgCommandRow[]>(`/guilds/${guildId}/lfg-commands`),
  createLfgCommand: (guildId: string, input: LfgCommandInput) =>
    request<LfgCommandRow>(`/guilds/${guildId}/lfg-commands`, { method: "POST", body: JSON.stringify(input) }),
  updateLfgCommand: (guildId: string, id: string, input: Partial<LfgCommandInput>) =>
    request<LfgCommandRow>(`/guilds/${guildId}/lfg-commands/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteLfgCommand: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/lfg-commands/${id}`, { method: "DELETE" }),
  addLfgCategory: (guildId: string, commandId: string, input: LfgCategoryInput) =>
    request<LfgCategoryRow[]>(`/guilds/${guildId}/lfg-commands/${commandId}/categories`, { method: "POST", body: JSON.stringify(input) }),
  updateLfgCategory: (guildId: string, commandId: string, categoryId: string, input: Partial<LfgCategoryInput>) =>
    request<LfgCategoryRow[]>(`/guilds/${guildId}/lfg-commands/${commandId}/categories/${categoryId}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteLfgCategory: (guildId: string, commandId: string, categoryId: string) =>
    request<LfgCategoryRow[]>(`/guilds/${guildId}/lfg-commands/${commandId}/categories/${categoryId}`, { method: "DELETE" }),

  getEmbedCreatorPresets: (guildId: string) => request<EmbedCreatorPresetRow[]>(`/guilds/${guildId}/embed-creator/presets`),
  saveEmbedCreatorPreset: (guildId: string, name: string, data: EmbedCreatorState) =>
    request<EmbedCreatorPresetRow>(`/guilds/${guildId}/embed-creator/presets`, { method: "POST", body: JSON.stringify({ name, data }) }),
  deleteEmbedCreatorPreset: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/embed-creator/presets/${id}`, { method: "DELETE" }),
  sendEmbedCreatorMessage: (guildId: string, input: EmbedCreatorSendInput) =>
    request<{ id: string }>(`/guilds/${guildId}/embed-creator/send`, { method: "POST", body: JSON.stringify(input) }),
  fetchEmbedCreatorMessage: (guildId: string, messageLink: string, webhookUrl?: string) =>
    request<EmbedCreatorFetchResult>(`/guilds/${guildId}/embed-creator/fetch`, { method: "POST", body: JSON.stringify({ messageLink, webhookUrl }) }),
  updateEmbedCreatorMessage: (guildId: string, input: EmbedCreatorSendInput & { channelId?: string; messageId: string }) =>
    request<{ ok: boolean }>(`/guilds/${guildId}/embed-creator/update`, { method: "PATCH", body: JSON.stringify(input) }),

  getLeaderboard: (guildId: string) => request<LeaderboardRow[]>(`/guilds/${guildId}/leaderboard`),
  getLevelingSettings: (guildId: string) => request<LevelingSettingsRow>(`/guilds/${guildId}/leveling-settings`),
  setLevelingSettings: (guildId: string, input: Partial<LevelingSettingsRow>) =>
    request<LevelingSettingsRow>(`/guilds/${guildId}/leveling-settings`, { method: "PATCH", body: JSON.stringify(input) }),

  getCommands: (guildId: string) => request<CustomCommand[]>(`/guilds/${guildId}/commands`),
  addCommand: (guildId: string, trigger: string, body: Omit<CustomCommand, "id" | "trigger">) =>
    request<CustomCommand>(`/guilds/${guildId}/commands`, {
      method: "POST",
      body: JSON.stringify({ trigger, ...body }),
    }),
  updateCommand: (guildId: string, id: string, body: Omit<CustomCommand, "id" | "trigger">) =>
    request<CustomCommand>(`/guilds/${guildId}/commands/${id}`, { method: "PUT", body: JSON.stringify(body) }),
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
  getPinnedModules: (guildId: string) => request<string[]>(`/guilds/${guildId}/pinned-modules`),
  setPinnedModule: (guildId: string, href: string, pinned: boolean) =>
    request<string[]>(`/guilds/${guildId}/pinned-modules/${encodeURIComponent(href)}`, { method: "PUT", body: JSON.stringify({ pinned }) }),
  getDiscordEmojis: (guildId: string) => request<DiscordEmojiOption[]>(`/guilds/${guildId}/discord/emojis`),
  getDiscordRoles: (guildId: string) => request<DiscordRoleOption[]>(`/guilds/${guildId}/discord/roles`),
  getDiscordMembers: (guildId: string, ids: string[]) =>
    request<DiscordMemberOption[]>(`/guilds/${guildId}/discord/members?ids=${ids.join(",")}`),

  getLogging: (guildId: string) => request<LoggingConfig>(`/guilds/${guildId}/logging`),
  setLogging: (guildId: string, config: Partial<LoggingConfig>) =>
    request<LoggingConfig>(`/guilds/${guildId}/logging`, { method: "PUT", body: JSON.stringify(config) }),

  getAntiRaid: (guildId: string) => request<AntiRaidConfig>(`/guilds/${guildId}/anti-raid`),
  setAntiRaid: (guildId: string, config: Partial<AntiRaidConfig>) =>
    request<AntiRaidConfig>(`/guilds/${guildId}/anti-raid`, { method: "PUT", body: JSON.stringify(config) }),

  getReactionRolePanels: (guildId: string) => request<ReactionRolePanelRow[]>(`/guilds/${guildId}/reaction-role-panels`),
  addReactionRolePanel: (guildId: string, body: ReactionRolePanelInput) =>
    request<ReactionRolePanelRow>(`/guilds/${guildId}/reaction-role-panels`, { method: "POST", body: JSON.stringify(body) }),
  updateReactionRolePanel: (guildId: string, id: string, body: Partial<ReactionRolePanelInput>) =>
    request<ReactionRolePanelRow>(`/guilds/${guildId}/reaction-role-panels/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  // keepMessage: the panel is being converted and the new one adopted its message.
  deleteReactionRolePanel: (guildId: string, id: string, keepMessage = false) =>
    request(`/guilds/${guildId}/reaction-role-panels/${id}${keepMessage ? "?keepMessage=1" : ""}`, { method: "DELETE" }),

  getJoinRoles: (guildId: string) => request<JoinRoleRow[]>(`/guilds/${guildId}/join-roles`),
  addJoinRole: (guildId: string, roleId: string) =>
    request<JoinRoleRow>(`/guilds/${guildId}/join-roles`, { method: "POST", body: JSON.stringify({ roleId }) }),
  deleteJoinRole: (guildId: string, id: string) => request(`/guilds/${guildId}/join-roles/${id}`, { method: "DELETE" }),

  getStickyMessages: (guildId: string) => request<StickyMessageRow[]>(`/guilds/${guildId}/sticky-messages`),
  addStickyMessage: (guildId: string, channelId: string, input: StickyMessageInput) =>
    request<StickyMessageRow>(`/guilds/${guildId}/sticky-messages`, {
      method: "POST",
      body: JSON.stringify({ channelId, ...input }),
    }),
  updateStickyMessage: (guildId: string, id: string, input: StickyMessageInput) =>
    request<StickyMessageRow>(`/guilds/${guildId}/sticky-messages/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteStickyMessage: (guildId: string, id: string) =>
    request(`/guilds/${guildId}/sticky-messages/${id}`, { method: "DELETE" }),
  resendStickyMessage: (guildId: string, id: string) =>
    request<{ ok: true }>(`/guilds/${guildId}/sticky-messages/${id}/resend`, { method: "POST" }),

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

  getAnnouncements: (guildId: string) => request<AnnouncementRow[]>(`/guilds/${guildId}/announcements`),
  addAnnouncement: (guildId: string, body: AnnouncementInput | AnnouncementComposeInput) =>
    request<AnnouncementRow>(`/guilds/${guildId}/announcements`, { method: "POST", body: JSON.stringify(body) }),
  updateAnnouncement: (guildId: string, id: string, body: AnnouncementInput | AnnouncementComposeInput) =>
    request<AnnouncementRow>(`/guilds/${guildId}/announcements/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  publishAnnouncement: (guildId: string, id: string) =>
    request<{ ok: true }>(`/guilds/${guildId}/announcements/${id}/publish`, { method: "POST" }),
  deleteAnnouncement: (guildId: string, id: string) => request(`/guilds/${guildId}/announcements/${id}`, { method: "DELETE" }),

  getAutoPurgeConfigs: (guildId: string) => request<AutoPurgeConfigRow[]>(`/guilds/${guildId}/auto-purge`),
  addAutoPurgeConfig: (guildId: string, body: Partial<AutoPurgeConfigRow> & { channelId: string }) =>
    request<AutoPurgeConfigRow>(`/guilds/${guildId}/auto-purge`, { method: "POST", body: JSON.stringify(body) }),
  updateAutoPurgeConfig: (guildId: string, id: string, body: Partial<AutoPurgeConfigRow>) =>
    request<AutoPurgeConfigRow>(`/guilds/${guildId}/auto-purge/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAutoPurgeConfig: (guildId: string, id: string) => request(`/guilds/${guildId}/auto-purge/${id}`, { method: "DELETE" }),

  getSlowModeChannels: (guildId: string) => request<SlowModeChannelRow[]>(`/guilds/${guildId}/slow-mode`),
  setSlowMode: (guildId: string, channelId: string, seconds: number) =>
    request<SlowModeChannelRow>(`/guilds/${guildId}/slow-mode/${channelId}`, { method: "PUT", body: JSON.stringify({ seconds }) }),

  getApplicationPanels: (guildId: string) => request<ApplicationPanelRow[]>(`/guilds/${guildId}/application-panels`),
  addApplicationPanel: (guildId: string, body: Partial<ApplicationPanelRow>) =>
    request<ApplicationPanelRow>(`/guilds/${guildId}/application-panels`, { method: "POST", body: JSON.stringify(body) }),
  updateApplicationPanel: (guildId: string, id: string, body: Partial<ApplicationPanelRow>) =>
    request<ApplicationPanelRow>(`/guilds/${guildId}/application-panels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteApplicationPanel: (guildId: string, id: string) => request(`/guilds/${guildId}/application-panels/${id}`, { method: "DELETE" }),

  getApplicationTypes: (guildId: string) => request<ApplicationTypeRow[]>(`/guilds/${guildId}/application-types`),
  addApplicationType: (guildId: string, body: Partial<ApplicationTypeRow>) =>
    request<ApplicationTypeRow>(`/guilds/${guildId}/application-types`, { method: "POST", body: JSON.stringify(body) }),
  updateApplicationType: (guildId: string, id: string, body: Partial<ApplicationTypeRow>) =>
    request<ApplicationTypeRow>(`/guilds/${guildId}/application-types/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteApplicationType: (guildId: string, id: string) => request(`/guilds/${guildId}/application-types/${id}`, { method: "DELETE" }),

  getSupportFlows: (guildId: string) => request<SupportFlowRow[]>(`/guilds/${guildId}/support-flows`),
  addSupportFlow: (guildId: string, body: Partial<SupportFlowRow>) =>
    request<SupportFlowRow>(`/guilds/${guildId}/support-flows`, { method: "POST", body: JSON.stringify(body) }),
  updateSupportFlow: (guildId: string, id: string, body: Partial<SupportFlowRow>) =>
    request<SupportFlowRow>(`/guilds/${guildId}/support-flows/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSupportFlow: (guildId: string, id: string) => request(`/guilds/${guildId}/support-flows/${id}`, { method: "DELETE" }),

  addSupportQuestion: (guildId: string, flowId: string, body: Partial<SupportQuestionRow>) =>
    request<SupportQuestionRow>(`/guilds/${guildId}/support-flows/${flowId}/questions`, { method: "POST", body: JSON.stringify(body) }),
  updateSupportQuestion: (guildId: string, flowId: string, id: string, body: Partial<SupportQuestionRow>) =>
    request<SupportQuestionRow>(`/guilds/${guildId}/support-flows/${flowId}/questions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSupportQuestion: (guildId: string, flowId: string, id: string) =>
    request(`/guilds/${guildId}/support-flows/${flowId}/questions/${id}`, { method: "DELETE" }),
  reorderSupportQuestions: (guildId: string, flowId: string, ids: string[]) =>
    request(`/guilds/${guildId}/support-flows/${flowId}/questions/order`, { method: "PUT", body: JSON.stringify({ ids }) }),

  getSupportTickets: (guildId: string, status?: string) =>
    request<SupportTicketRow[]>(`/guilds/${guildId}/support-tickets${status ? `?status=${status}` : ""}`),

  getSupportSettings: (guildId: string) => request<SupportSettingsRow>(`/guilds/${guildId}/support-settings`),
  setSupportSettings: (guildId: string, body: Partial<SupportSettingsRow>) =>
    request<SupportSettingsRow>(`/guilds/${guildId}/support-settings`, { method: "PUT", body: JSON.stringify(body) }),

  getApplications: (guildId: string, status?: ApplicationStatus) =>
    request<ApplicationRow[]>(`/guilds/${guildId}/applications${status ? `?status=${status}` : ""}`),
  getApplicationCounts: (guildId: string) => request<ApplicationCounts>(`/guilds/${guildId}/applications/counts`),

  getApplicationSettings: (guildId: string) => request<ApplicationSettingsRow>(`/guilds/${guildId}/application-settings`),
  setApplicationSettings: (guildId: string, body: Partial<ApplicationSettingsRow>) =>
    request<ApplicationSettingsRow>(`/guilds/${guildId}/application-settings`, { method: "PUT", body: JSON.stringify(body) }),

  getBirthdayConfig: (guildId: string) => request<BirthdayConfigRow>(`/guilds/${guildId}/birthday-config`),
  setBirthdayConfig: (guildId: string, body: Partial<BirthdayConfigRow>) =>
    request<BirthdayConfigRow>(`/guilds/${guildId}/birthday-config`, { method: "PUT", body: JSON.stringify(body) }),
  sendBirthdayTest: (guildId: string) => request<{ ok: boolean }>(`/guilds/${guildId}/birthday-config/send-test`, { method: "POST" }),
  getBirthdays: (guildId: string) => request<BirthdayRow[]>(`/guilds/${guildId}/birthdays`),
  deleteBirthday: (guildId: string, userId: string) => request(`/guilds/${guildId}/birthdays/${userId}`, { method: "DELETE" }),

  getRolePanels: (guildId: string) => request<RolePanelRow[]>(`/guilds/${guildId}/role-panels`),
  addRolePanel: (guildId: string, body: Partial<RolePanelRow>) =>
    request<RolePanelRow>(`/guilds/${guildId}/role-panels`, { method: "POST", body: JSON.stringify(body) }),
  updateRolePanel: (guildId: string, id: string, body: Partial<RolePanelRow>) =>
    request<RolePanelRow>(`/guilds/${guildId}/role-panels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRolePanel: (guildId: string, id: string, keepMessage = false) =>
    request(`/guilds/${guildId}/role-panels/${id}${keepMessage ? "?keepMessage=1" : ""}`, { method: "DELETE" }),

  getTicketPanels: (guildId: string) => request<TicketPanelRow[]>(`/guilds/${guildId}/ticket-panels`),
  addTicketPanel: (guildId: string, body: Partial<TicketPanelRow>) =>
    request<TicketPanelRow>(`/guilds/${guildId}/ticket-panels`, { method: "POST", body: JSON.stringify(body) }),
  updateTicketPanel: (guildId: string, id: string, body: Partial<TicketPanelRow>) =>
    request<TicketPanelRow>(`/guilds/${guildId}/ticket-panels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTicketPanel: (guildId: string, id: string) => request(`/guilds/${guildId}/ticket-panels/${id}`, { method: "DELETE" }),
  resetTicketNumbers: (guildId: string) => request(`/guilds/${guildId}/ticket-panels/reset-numbers`, { method: "POST" }),

  getTicketTypes: (guildId: string) => request<TicketTypeRow[]>(`/guilds/${guildId}/ticket-types`),
  addTicketType: (guildId: string, body: Partial<TicketTypeRow>) =>
    request<TicketTypeRow>(`/guilds/${guildId}/ticket-types`, { method: "POST", body: JSON.stringify(body) }),
  updateTicketType: (guildId: string, id: string, body: Partial<TicketTypeRow>) =>
    request<TicketTypeRow>(`/guilds/${guildId}/ticket-types/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTicketType: (guildId: string, id: string) => request(`/guilds/${guildId}/ticket-types/${id}`, { method: "DELETE" }),

  getTickets: (guildId: string, params?: { view?: string; search?: string; typeId?: string; priority?: string }) => {
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][]).toString();
    return request<TicketRow[]>(`/guilds/${guildId}/tickets${qs ? `?${qs}` : ""}`);
  },
  getTicketCounts: (guildId: string) => request<TicketCounts>(`/guilds/${guildId}/tickets/counts`),
  updateTicket: (guildId: string, id: string, body: Partial<TicketRow>) =>
    request<TicketRow>(`/guilds/${guildId}/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  generateTicketTranscript: (guildId: string, id: string, channelId?: string) =>
    request<{ channelId: string }>(`/guilds/${guildId}/tickets/${id}/transcript`, { method: "POST", body: JSON.stringify({ channelId }) }),

  getTicketTags: (guildId: string) => request<TicketTagRow[]>(`/guilds/${guildId}/ticket-tags`),
  addTicketTag: (guildId: string, body: Partial<TicketTagRow>) =>
    request<TicketTagRow>(`/guilds/${guildId}/ticket-tags`, { method: "POST", body: JSON.stringify(body) }),
  deleteTicketTag: (guildId: string, id: string) => request(`/guilds/${guildId}/ticket-tags/${id}`, { method: "DELETE" }),

  getTicketCannedResponses: (guildId: string) => request<TicketCannedResponseRow[]>(`/guilds/${guildId}/ticket-canned-responses`),
  addTicketCannedResponse: (guildId: string, body: Partial<TicketCannedResponseRow>) =>
    request<TicketCannedResponseRow>(`/guilds/${guildId}/ticket-canned-responses`, { method: "POST", body: JSON.stringify(body) }),
  updateTicketCannedResponse: (guildId: string, id: string, body: Partial<TicketCannedResponseRow>) =>
    request<TicketCannedResponseRow>(`/guilds/${guildId}/ticket-canned-responses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTicketCannedResponse: (guildId: string, id: string) => request(`/guilds/${guildId}/ticket-canned-responses/${id}`, { method: "DELETE" }),

  getTicketKnowledge: (guildId: string) => request<TicketKnowledgeBaseRow[]>(`/guilds/${guildId}/ticket-knowledge`),
  addTicketKnowledge: (guildId: string, body: Partial<TicketKnowledgeBaseRow>) =>
    request<TicketKnowledgeBaseRow>(`/guilds/${guildId}/ticket-knowledge`, { method: "POST", body: JSON.stringify(body) }),
  updateTicketKnowledge: (guildId: string, id: string, body: Partial<TicketKnowledgeBaseRow>) =>
    request<TicketKnowledgeBaseRow>(`/guilds/${guildId}/ticket-knowledge/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTicketKnowledge: (guildId: string, id: string) => request(`/guilds/${guildId}/ticket-knowledge/${id}`, { method: "DELETE" }),

  getTicketSettings: (guildId: string) => request<TicketSettingsRow>(`/guilds/${guildId}/ticket-settings`),
  setTicketSettings: (guildId: string, body: Partial<TicketSettingsRow>) =>
    request<TicketSettingsRow>(`/guilds/${guildId}/ticket-settings`, { method: "PUT", body: JSON.stringify(body) }),
  resetTicketSettings: (guildId: string) => request<TicketSettingsRow>(`/guilds/${guildId}/ticket-settings/reset`, { method: "POST" }),

  getTicketAnalytics: (guildId: string, days: number) =>
    request<TicketAnalytics>(`/guilds/${guildId}/ticket-analytics?days=${days}`),

  getGiveaways: (guildId: string) => request<GiveawayRow[]>(`/guilds/${guildId}/giveaways`),
  addGiveaway: (guildId: string, body: GiveawayInput) =>
    request<GiveawayRow>(`/guilds/${guildId}/giveaways`, { method: "POST", body: JSON.stringify(body) }),

  getPolls: (guildId: string) => request<PollRow[]>(`/guilds/${guildId}/polls`),
  addPoll: (guildId: string, body: PollInput) => request<PollRow>(`/guilds/${guildId}/polls`, { method: "POST", body: JSON.stringify(body) }),
  stopPoll: (guildId: string, id: string) => request<PollRow>(`/guilds/${guildId}/polls/${id}/stop`, { method: "POST" }),
  deletePoll: (guildId: string, id: string) => request(`/guilds/${guildId}/polls/${id}`, { method: "DELETE" }),

  getEconomyConfig: (guildId: string) => request<EconomyConfig>(`/guilds/${guildId}/economy/config`),
  setEconomyConfig: (guildId: string, config: Partial<EconomyConfig>) =>
    request<EconomyConfig>(`/guilds/${guildId}/economy/config`, { method: "PUT", body: JSON.stringify(config) }),
  getEconomyLeaderboard: (guildId: string) => request<EconomyBalanceRow[]>(`/guilds/${guildId}/economy/leaderboard`),
  getEconomyAnalytics: (guildId: string, days: number) => request<EconomyAnalytics>(`/guilds/${guildId}/economy/analytics?days=${days}`),

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
  deleteCase: (guildId: string, caseNumber: number) =>
    request(`/guilds/${guildId}/cases/${caseNumber}`, { method: "DELETE" }),

  getReports: (guildId: string) =>
    request<
      Array<{
        id: string;
        reportNumber: number | null;
        reporterId: string;
        reportedUserId: string;
        reason: string;
        status: string;
        channelId: string | null;
        claimedById: string | null;
        closedAt: string | null;
        transcript: Array<{ authorId: string; authorTag: string; content: string; attachmentUrls: string[]; at: string }>;
        createdAt: string;
      }>
    >(`/guilds/${guildId}/reports`),
  purgeReports: (guildId: string) => request<{ deleted: number }>(`/guilds/${guildId}/reports`, { method: "DELETE" }),

  getReportSettings: (guildId: string) => request<ReportSettingsRow>(`/guilds/${guildId}/report-settings`),
  setReportSettings: (guildId: string, body: Partial<ReportSettingsRow>) =>
    request<ReportSettingsRow>(`/guilds/${guildId}/report-settings`, { method: "PUT", body: JSON.stringify(body) }),

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

  getChannelLocks: (guildId: string) => request<ChannelLockRow[]>(`/guilds/${guildId}/channel-locks`),
  addChannelLock: (guildId: string, channelId: string, input: ChannelLockInput) =>
    request<ChannelLockRow>(`/guilds/${guildId}/channel-locks`, { method: "POST", body: JSON.stringify({ channelId, ...input }) }),
  updateChannelLock: (guildId: string, id: string, input: ChannelLockInput) =>
    request<ChannelLockRow>(`/guilds/${guildId}/channel-locks/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteChannelLock: (guildId: string, id: string) => request(`/guilds/${guildId}/channel-locks/${id}`, { method: "DELETE" }),

  getErrors: (guildId: string) => request<ErrorLogRow[]>(`/guilds/${guildId}/errors`),
  clearErrors: (guildId: string) => request(`/guilds/${guildId}/errors`, { method: "DELETE" }),

  getAlertSettings: (guildId: string) => request<AlertSettingsRow>(`/guilds/${guildId}/alert-settings`),
  updateAlertSettings: (guildId: string, input: Partial<AlertSettingsRow>) =>
    request<AlertSettingsRow>(`/guilds/${guildId}/alert-settings`, { method: "PUT", body: JSON.stringify(input) }),

  getWarnEscalationSettings: (guildId: string) => request<WarnEscalationSettingsRow>(`/guilds/${guildId}/warn-escalation`),
  updateWarnEscalationSettings: (guildId: string, input: Partial<WarnEscalationSettingsRow>) =>
    request<WarnEscalationSettingsRow>(`/guilds/${guildId}/warn-escalation`, { method: "PUT", body: JSON.stringify(input) }),

  getPrestigeSettings: (guildId: string) => request<PrestigeSettingsRow>(`/guilds/${guildId}/prestige-settings`),
  updatePrestigeSettings: (guildId: string, input: Partial<PrestigeSettingsRow>) =>
    request<PrestigeSettingsRow>(`/guilds/${guildId}/prestige-settings`, { method: "PUT", body: JSON.stringify(input) }),

  getBumpReminderSettings: (guildId: string) => request<BumpReminderSettingsRow>(`/guilds/${guildId}/bump-reminder`),
  updateBumpReminderSettings: (guildId: string, input: Partial<BumpReminderSettingsRow>) =>
    request<BumpReminderSettingsRow>(`/guilds/${guildId}/bump-reminder`, { method: "PUT", body: JSON.stringify(input) }),

  getRulesGateSettings: (guildId: string) => request<RulesGateSettingsRow>(`/guilds/${guildId}/rules-gate-settings`),
  updateRulesGateSettings: (guildId: string, input: Partial<RulesGateSettingsRow>) =>
    request<RulesGateSettingsRow>(`/guilds/${guildId}/rules-gate-settings`, { method: "PUT", body: JSON.stringify(input) }),
  getRulesGateAgreements: (guildId: string) => request<RulesGateAgreementRow[]>(`/guilds/${guildId}/rules-gate-agreements`),
  purgeRulesGateAgreements: (guildId: string) =>
    request<{ deleted: number }>(`/guilds/${guildId}/rules-gate-agreements`, { method: "DELETE" }),
  bumpRulesGateVersion: (guildId: string) =>
    request<{ newVersion: number; revoked: number }>(`/guilds/${guildId}/rules-gate-settings/bump-version`, { method: "POST" }),
  getRulesGateSections: (guildId: string) => request<RulesGateSectionRow[]>(`/guilds/${guildId}/rules-gate-sections`),
  addRulesGateSection: (guildId: string, input: { label: string; roleId: string }) =>
    request<RulesGateSectionRow>(`/guilds/${guildId}/rules-gate-sections`, { method: "POST", body: JSON.stringify(input) }),
  deleteRulesGateSection: (guildId: string, id: string) =>
    request<{ ok: boolean }>(`/guilds/${guildId}/rules-gate-sections/${id}`, { method: "DELETE" }),

  getConfessionSettings: (guildId: string) => request<ConfessionSettingsRow>(`/guilds/${guildId}/confession-settings`),
  updateConfessionSettings: (guildId: string, input: Partial<ConfessionSettingsRow>) =>
    request<ConfessionSettingsRow>(`/guilds/${guildId}/confession-settings`, { method: "PUT", body: JSON.stringify(input) }),

  getMilestoneSettings: (guildId: string) => request<MilestoneSettingsRow>(`/guilds/${guildId}/milestone-settings`),
  updateMilestoneSettings: (guildId: string, input: Partial<MilestoneSettingsRow>) =>
    request<MilestoneSettingsRow>(`/guilds/${guildId}/milestone-settings`, { method: "PUT", body: JSON.stringify(input) }),

  getSuggestionAnalyticsSettings: (guildId: string) => request<SuggestionAnalyticsSettingsRow>(`/guilds/${guildId}/suggestion-analytics`),
  updateSuggestionAnalyticsSettings: (guildId: string, input: Partial<SuggestionAnalyticsSettingsRow>) =>
    request<SuggestionAnalyticsSettingsRow>(`/guilds/${guildId}/suggestion-analytics`, { method: "PUT", body: JSON.stringify(input) }),

  getAppealSettings: (guildId: string) => request<AppealSettingsRow>(`/guilds/${guildId}/appeal-settings`),
  updateAppealSettings: (guildId: string, input: Partial<AppealSettingsRow>) =>
    request<AppealSettingsRow>(`/guilds/${guildId}/appeal-settings`, { method: "PUT", body: JSON.stringify(input) }),
  getAppeals: (guildId: string) => request<AppealRow[]>(`/guilds/${guildId}/appeals`),

  getModDigestSettings: (guildId: string) => request<ModDigestSettingsRow>(`/guilds/${guildId}/mod-digest-settings`),
  updateModDigestSettings: (guildId: string, input: Partial<ModDigestSettingsRow>) =>
    request<ModDigestSettingsRow>(`/guilds/${guildId}/mod-digest-settings`, { method: "PUT", body: JSON.stringify(input) }),
  sendModDigestNow: (guildId: string) => request<{ ok: boolean }>(`/guilds/${guildId}/mod-digest-settings/send-now`, { method: "POST" }),

  getWeeklyRecapSettings: (guildId: string) => request<WeeklyRecapSettingsRow>(`/guilds/${guildId}/weekly-recap-settings`),
  updateWeeklyRecapSettings: (guildId: string, input: Partial<WeeklyRecapSettingsRow>) =>
    request<WeeklyRecapSettingsRow>(`/guilds/${guildId}/weekly-recap-settings`, { method: "PUT", body: JSON.stringify(input) }),
  sendWeeklyRecapTest: (guildId: string) => request<{ ok: boolean }>(`/guilds/${guildId}/weekly-recap-settings/send-test`, { method: "POST" }),

  getVoiceActivity: (guildId: string) => request<VoiceActivityRow[]>(`/guilds/${guildId}/voice-activity`),
  getAchievements: (guildId: string) => request<AchievementRow[]>(`/guilds/${guildId}/achievements`),
  getChangelog: () => request<ChangelogEntryRow[]>(`/changelog`),
  getChangelogUnseenCount: () => request<{ count: number }>(`/changelog/unseen-count`),
  markChangelogSeen: () => request<{ userId: string }>(`/changelog/mark-seen`, { method: "POST" }),
  addChangelogEntry: (title: string, description: string) =>
    request<ChangelogEntryRow>(`/changelog`, { method: "POST", body: JSON.stringify({ title, description }) }),
  updateChangelogEntry: (id: string, input: Partial<{ title: string; description: string }>) =>
    request<ChangelogEntryRow>(`/changelog/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteChangelogEntry: (id: string) => request(`/changelog/${id}`, { method: "DELETE" }),

  getAchievementSettings: (guildId: string) => request<AchievementSettingsRow>(`/guilds/${guildId}/achievement-settings`),
  setAchievementSettings: (guildId: string, input: Partial<AchievementSettingsRow>) =>
    request<AchievementSettingsRow>(`/guilds/${guildId}/achievement-settings`, { method: "PATCH", body: JSON.stringify(input) }),
  getCustomAchievements: (guildId: string) => request<CustomAchievementRow[]>(`/guilds/${guildId}/custom-achievements`),
  addCustomAchievement: (guildId: string, input: CustomAchievementInput) =>
    request<CustomAchievementRow>(`/guilds/${guildId}/custom-achievements`, { method: "POST", body: JSON.stringify(input) }),
  deleteCustomAchievement: (guildId: string, id: string) => request(`/guilds/${guildId}/custom-achievements/${id}`, { method: "DELETE" }),

  getBotConfig: () => request<BotConfigRow>("/bot-config"),
  setBotConfig: (input: BotConfigInput) =>
    request<{ config: BotConfigRow; errors: string[] }>("/bot-config", { method: "PUT", body: JSON.stringify(input) }),
};
