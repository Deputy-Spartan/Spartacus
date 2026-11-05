// Command Builder: custom /commands made from steps. Each step is one action
// from this catalog. The dashboard builds the forms from it and the bot runs
// it, so both always agree on what an action needs.

export type ParamType =
  | "text" // short text; can use {inputs}
  | "longtext"
  | "number"
  | "duration" // 30s, 10m, 2h, 1d
  | "color"
  | "url"
  | "emoji"
  | "select" // one of opts
  | "channel" // text channel (blank = where the command was used)
  | "voice"
  | "category"
  | "anychannel"
  | "role"
  | "roles" // several roles
  | "user" // a member (blank = whoever ran it)
  | "userid" // anyone by id, for unban
  | "message" // a message link or id (blank = the last message Spartacus posted in this command)
  | "perms"; // permissions to allow or deny

export interface ActionParam {
  k: string;
  label: string;
  type: ParamType;
  req?: boolean;
  opts?: string[];
  hint?: string;
}

export interface ActionDef {
  id: string;
  group: string;
  name: string;
  desc: string;
  params: ActionParam[];
  risky?: boolean; // asks "Yes, do it" first
  perm?: string; // the Discord permission the person running it needs (PermissionFlagsBits key)
}

export const ACTION_GROUPS = [
  ["msg", "💬 Messages"],
  ["mem", "👤 Members & moderation"],
  ["role", "🎭 Roles"],
  ["chan", "#️⃣ Channels"],
  ["cat", "📂 Categories"],
  ["onb", "🧭 Onboarding"],
  ["srv", "🏰 Server"],
  ["auto", "🛡️ AutoMod"],
  ["evt", "📅 Events"],
  ["emo", "😀 Emojis, stickers & webhooks"],
  ["sp", "⚡ Spartacus"],
  ["flow", "🔀 Flow"],
] as const;

const P = (k: string, label: string, type: ParamType, extra: Partial<ActionParam> = {}): ActionParam => ({ k, label, type, ...extra });
const channel = P("channel", "Channel", "channel", { hint: "Blank: where the command was used" });
const member = P("user", "Member", "user", { req: true });
const reason = P("reason", "Reason", "text");
const role = P("role", "Role", "role", { req: true });
const anyChannel = P("channel", "Channel", "anychannel", { req: true });
const PERM_LIST = [
  "ViewChannel",
  "SendMessages",
  "SendMessagesInThreads",
  "CreatePublicThreads",
  "EmbedLinks",
  "AttachFiles",
  "AddReactions",
  "UseExternalEmojis",
  "MentionEveryone",
  "ReadMessageHistory",
  "UseApplicationCommands",
  "Connect",
  "Speak",
  "Stream",
  "UseVAD",
  "PrioritySpeaker",
  "MuteMembers",
  "DeafenMembers",
  "MoveMembers",
  "ManageMessages",
  "ManageChannels",
  "ManageRoles",
  "ManageThreads",
  "ManageWebhooks",
  "KickMembers",
  "BanMembers",
  "ModerateMembers",
  "ManageNicknames",
  "ChangeNickname",
  "CreateInstantInvite",
  "ManageGuild",
  "ManageEvents",
  "ViewAuditLog",
  "Administrator",
] as const;
export const PERMISSIONS: readonly string[] = PERM_LIST;
const perms = P("perms", "Permissions", "perms", { req: true });

export const ACTIONS: ActionDef[] = [
  // ---- Messages
  { id: "send_message", group: "msg", name: "Send a message", desc: "Text in a channel", params: [channel, P("text", "Message", "longtext", { req: true })] },
  { id: "post_embed", group: "msg", name: "Post an embed", desc: "A card with a title, text and color", params: [channel, P("title", "Title", "text"), P("description", "Text", "longtext", { req: true }), P("color", "Color", "color"), P("image", "Image link", "url")] },
  { id: "reply_private", group: "msg", name: "Reply only to them", desc: "A private message only the person who ran it sees", params: [P("text", "Message", "longtext", { req: true })] },
  { id: "dm", group: "msg", name: "DM a member", desc: "Send a direct message", params: [member, P("text", "Message", "longtext", { req: true })] },
  { id: "role_buttons", group: "msg", name: "Post role buttons", desc: "Buttons members tap to get or drop roles", params: [channel, P("text", "Message", "longtext", { req: true }), P("roles", "Roles", "roles", { req: true })], perm: "ManageRoles" },
  { id: "poll", group: "msg", name: "Post a Discord poll", desc: "A native poll with answers and a time limit", params: [channel, P("question", "Question", "text", { req: true }), P("answers", "Answers (one per line)", "longtext", { req: true }), P("hours", "Lasts (hours)", "number"), P("multi", "Pick more than one", "select", { opts: ["No", "Yes"] })] },
  { id: "edit_message", group: "msg", name: "Edit a Spartacus message", desc: "Change the text of a message Spartacus sent", params: [P("message", "Message", "message"), P("text", "New text", "longtext", { req: true })], perm: "ManageMessages" },
  { id: "purge", group: "msg", name: "Delete messages (purge)", desc: "The last messages in a channel, optionally only some", params: [channel, P("count", "How many (up to 100)", "number", { req: true }), P("only", "Only", "select", { opts: ["Everything", "From one member", "From bots", "With links", "With images"] }), P("user", "Member (for From one member)", "user")], risky: true, perm: "ManageMessages" },
  { id: "pin", group: "msg", name: "Pin or unpin a message", desc: "", params: [P("message", "Message", "message"), P("mode", "Do", "select", { opts: ["Pin", "Unpin"] })], perm: "ManageMessages" },
  { id: "react", group: "msg", name: "React to a message", desc: "Add an emoji reaction", params: [P("message", "Message", "message"), P("emoji", "Emoji", "emoji", { req: true })] },
  { id: "publish", group: "msg", name: "Publish an announcement", desc: "Send it to servers following the channel", params: [P("message", "Message", "message")], perm: "ManageMessages" },
  { id: "send_later", group: "msg", name: "Send a message later", desc: "Once, after a delay (up to 30 days)", params: [channel, P("text", "Message", "longtext", { req: true }), P("after", "After", "duration", { req: true })] },
  { id: "thread", group: "msg", name: "Create a thread", desc: "Public or private, in a channel", params: [channel, P("name", "Thread name", "text", { req: true }), P("kind", "Kind", "select", { opts: ["Public", "Private"] })], perm: "CreatePublicThreads" },
  // ---- Members
  { id: "warn", group: "mem", name: "Warn", desc: "Adds a warning case and DMs them", params: [member, reason], perm: "ModerateMembers" },
  { id: "timeout", group: "mem", name: "Timeout", desc: "Mute them for a while (up to 28 days)", params: [member, P("for", "For", "duration", { req: true }), reason], risky: true, perm: "ModerateMembers" },
  { id: "untimeout", group: "mem", name: "Remove timeout", desc: "", params: [member], perm: "ModerateMembers" },
  { id: "kick", group: "mem", name: "Kick", desc: "Remove them from the server", params: [member, reason], risky: true, perm: "KickMembers" },
  { id: "ban", group: "mem", name: "Ban", desc: "Ban, and optionally delete their recent messages", params: [member, reason, P("days", "Delete messages from the last (days, 0–7)", "number")], risky: true, perm: "BanMembers" },
  { id: "tempban", group: "mem", name: "Temporary ban", desc: "Ban, then unban by itself later", params: [member, P("for", "For", "duration", { req: true }), reason], risky: true, perm: "BanMembers" },
  { id: "unban", group: "mem", name: "Unban", desc: "Lift a ban by user ID", params: [P("user", "User ID", "userid", { req: true }), reason], perm: "BanMembers" },
  { id: "nickname", group: "mem", name: "Change nickname", desc: "Blank resets it", params: [member, P("nick", "Nickname", "text")], perm: "ManageNicknames" },
  { id: "move_voice", group: "mem", name: "Move to a voice channel", desc: "They need to be in voice", params: [member, P("voice", "To", "voice", { req: true })], perm: "MoveMembers" },
  { id: "disconnect", group: "mem", name: "Disconnect from voice", desc: "", params: [member], perm: "MoveMembers" },
  { id: "server_mute", group: "mem", name: "Server mute or unmute", desc: "", params: [member, P("mode", "Do", "select", { opts: ["Mute", "Unmute"] })], perm: "MuteMembers" },
  { id: "server_deafen", group: "mem", name: "Server deafen or undeafen", desc: "", params: [member, P("mode", "Do", "select", { opts: ["Deafen", "Undeafen"] })], perm: "DeafenMembers" },
  { id: "quarantine", group: "mem", name: "Quarantine", desc: "Take all their roles (saved, /release gives them back)", params: [member, reason], risky: true, perm: "ModerateMembers" },
  // ---- Roles
  { id: "give_role", group: "role", name: "Give a role", desc: "", params: [P("user", "Member", "user", { hint: "Blank: whoever ran it" }), role], perm: "ManageRoles" },
  { id: "remove_role", group: "role", name: "Remove a role", desc: "", params: [P("user", "Member", "user", { hint: "Blank: whoever ran it" }), role], perm: "ManageRoles" },
  { id: "toggle_role", group: "role", name: "Toggle a role", desc: "Give it if they don't have it, take it if they do", params: [P("user", "Member", "user", { hint: "Blank: whoever ran it" }), role], perm: "ManageRoles" },
  { id: "temp_role", group: "role", name: "Give a temporary role", desc: "Comes off by itself after a while", params: [P("user", "Member", "user", { hint: "Blank: whoever ran it" }), role, P("for", "For", "duration", { req: true })], perm: "ManageRoles" },
  { id: "create_role", group: "role", name: "Create a role", desc: "Name, color, shown separately, mentionable", params: [P("name", "Name", "text", { req: true }), P("color", "Color", "color"), P("hoist", "Show separately in the member list", "select", { opts: ["No", "Yes"] }), P("mentionable", "Anyone can @mention it", "select", { opts: ["No", "Yes"] })], perm: "ManageRoles" },
  { id: "edit_role", group: "role", name: "Edit a role", desc: "Rename, recolor or change its permissions", params: [role, P("name", "New name", "text"), P("color", "New color", "color"), P("perms", "Permissions", "perms")], risky: true, perm: "ManageRoles" },
  { id: "move_role", group: "role", name: "Move a role up or down", desc: "", params: [role, P("dir", "Direction", "select", { opts: ["Up", "Down"] }), P("by", "Places", "number")], risky: true, perm: "ManageRoles" },
  { id: "delete_role", group: "role", name: "Delete a role", desc: "", params: [role], risky: true, perm: "ManageRoles" },
  { id: "bulk_give", group: "role", name: "Give a role to everyone with another role", desc: "e.g. everyone with @Member gets @Season 2", params: [P("from", "Everyone with", "role", { req: true }), P("role", "Gets", "role", { req: true })], risky: true, perm: "ManageRoles" },
  { id: "bulk_remove", group: "role", name: "Remove a role from everyone", desc: "", params: [role], risky: true, perm: "ManageRoles" },
  // ---- Channels
  { id: "create_text", group: "chan", name: "Create a text channel", desc: "", params: [P("name", "Name", "text", { req: true }), P("category", "In category", "category"), P("topic", "Topic", "text"), P("private", "Private (only the person who ran it and staff)", "select", { opts: ["No", "Yes"] })], perm: "ManageChannels" },
  { id: "create_voice", group: "chan", name: "Create a voice channel", desc: "", params: [P("name", "Name", "text", { req: true }), P("category", "In category", "category"), P("limit", "User limit (0 = none)", "number"), P("private", "Private (only the person who ran it and staff)", "select", { opts: ["No", "Yes"] })], perm: "ManageChannels" },
  { id: "create_other", group: "chan", name: "Create a forum, stage or announcement channel", desc: "", params: [P("kind", "Kind", "select", { opts: ["Forum", "Stage", "Announcement"] }), P("name", "Name", "text", { req: true }), P("category", "In category", "category")], perm: "ManageChannels" },
  { id: "rename_channel", group: "chan", name: "Rename a channel", desc: "", params: [anyChannel, P("name", "New name", "text", { req: true })], perm: "ManageChannels" },
  { id: "set_topic", group: "chan", name: "Set the channel topic", desc: "", params: [channel, P("topic", "Topic", "text")], perm: "ManageChannels" },
  { id: "move_channel", group: "chan", name: "Move a channel", desc: "To another category", params: [anyChannel, P("category", "To category", "category", { req: true })], risky: true, perm: "ManageChannels" },
  { id: "clone_channel", group: "chan", name: "Clone a channel", desc: "Copy it with its permissions", params: [anyChannel, P("name", "New name", "text")], perm: "ManageChannels" },
  { id: "delete_channel", group: "chan", name: "Delete a channel", desc: "", params: [anyChannel], risky: true, perm: "ManageChannels" },
  { id: "lock_channel", group: "chan", name: "Lock or unlock a channel", desc: "Stop or allow messages", params: [channel, P("mode", "Do", "select", { opts: ["Lock", "Unlock"] }), P("role", "For role (blank: @everyone)", "role")], perm: "ManageChannels" },
  { id: "hide_channel", group: "chan", name: "Hide or show a channel", desc: "", params: [anyChannel, P("mode", "Do", "select", { opts: ["Hide", "Show"] }), P("role", "For role (blank: @everyone)", "role")], risky: true, perm: "ManageChannels" },
  { id: "channel_perms", group: "chan", name: "Set channel permissions", desc: "Allow or deny any permission for a role or member", params: [anyChannel, P("role", "Role", "role"), P("user", "Or a member", "user"), perms], risky: true, perm: "ManageRoles" },
  { id: "sync_channel", group: "chan", name: "Sync with its category", desc: "Make its permissions match the category", params: [anyChannel], risky: true, perm: "ManageChannels" },
  { id: "slowmode", group: "chan", name: "Set slowmode", desc: "0 turns it off; up to 6 hours", params: [channel, P("every", "One message every", "duration", { req: true })], perm: "ManageChannels" },
  { id: "nsfw", group: "chan", name: "Set age-restricted", desc: "", params: [channel, P("mode", "Age-restricted", "select", { opts: ["On", "Off"] })], perm: "ManageChannels" },
  { id: "voice_settings", group: "chan", name: "Set voice user limit or bitrate", desc: "", params: [P("voice", "Voice channel", "voice", { req: true }), P("limit", "User limit (0 = none)", "number"), P("bitrate", "Bitrate (kbps)", "number")], perm: "ManageChannels" },
  { id: "voice_status", group: "chan", name: "Set a voice channel status", desc: "The line under the channel's name", params: [P("voice", "Voice channel", "voice", { req: true }), P("status", "Status", "text")], perm: "ManageChannels" },
  { id: "thread_manage", group: "chan", name: "Archive, lock or delete a thread", desc: "", params: [P("channel", "Thread", "anychannel", { req: true }), P("mode", "Do", "select", { opts: ["Archive", "Lock", "Delete"] })], risky: true, perm: "ManageThreads" },
  { id: "invite", group: "chan", name: "Create an invite", desc: "Shown in the reply", params: [channel, P("uses", "Max uses (0 = no limit)", "number"), P("expires", "Expires after (blank = never)", "duration")], perm: "CreateInstantInvite" },
  { id: "delete_invites", group: "chan", name: "Delete invites", desc: "One by code, or all of them", params: [P("code", "Invite code (blank = all)", "text")], risky: true, perm: "ManageGuild" },
  // ---- Categories
  { id: "create_category", group: "cat", name: "Create a category", desc: "", params: [P("name", "Name", "text", { req: true }), P("private", "Hide from @everyone", "select", { opts: ["No", "Yes"] })], perm: "ManageChannels" },
  { id: "rename_category", group: "cat", name: "Rename a category", desc: "", params: [P("category", "Category", "category", { req: true }), P("name", "New name", "text", { req: true })], perm: "ManageChannels" },
  { id: "move_category", group: "cat", name: "Move a category up or down", desc: "", params: [P("category", "Category", "category", { req: true }), P("dir", "Direction", "select", { opts: ["Up", "Down"] }), P("by", "Places", "number")], risky: true, perm: "ManageChannels" },
  { id: "category_perms", group: "cat", name: "Set category permissions", desc: "Optionally sync every channel inside it", params: [P("category", "Category", "category", { req: true }), P("role", "Role (blank: @everyone)", "role"), perms, P("sync", "Sync the channels inside", "select", { opts: ["Yes", "No"] })], risky: true, perm: "ManageRoles" },
  { id: "delete_category", group: "cat", name: "Delete a category", desc: "", params: [P("category", "Category", "category", { req: true }), P("mode", "Its channels", "select", { opts: ["Keep them", "Delete them too"] })], risky: true, perm: "ManageChannels" },
  // ---- Onboarding
  { id: "onb_question", group: "onb", name: "Create an onboarding question", desc: "With its first answer", params: [P("title", "Question", "text", { req: true }), P("answer", "First answer", "text", { req: true }), P("role", "That answer gives", "role"), P("channel", "And shows", "anychannel"), P("single", "One answer only", "select", { opts: ["No", "Yes"] }), P("required", "Required", "select", { opts: ["No", "Yes"] })], perm: "ManageGuild" },
  { id: "onb_answer", group: "onb", name: "Add an answer to a question", desc: "Gives roles and/or shows a channel", params: [P("question", "Question (its title)", "text", { req: true }), P("answer", "Answer", "text", { req: true }), P("role", "Gives", "role"), P("channel", "Shows", "anychannel"), P("emoji", "Emoji", "emoji")], perm: "ManageGuild" },
  { id: "onb_edit", group: "onb", name: "Edit a question", desc: "Rename it, or change one answer or required", params: [P("question", "Question (its title)", "text", { req: true }), P("title", "New title", "text"), P("required", "Required", "select", { opts: ["Leave as is", "Yes", "No"] })], risky: true, perm: "ManageGuild" },
  { id: "onb_remove", group: "onb", name: "Remove a question or answer", desc: "", params: [P("question", "Question (its title)", "text", { req: true }), P("answer", "Answer (blank: the whole question)", "text")], risky: true, perm: "ManageGuild" },
  { id: "onb_default", group: "onb", name: "Add or remove a default channel", desc: "Channels every new member sees", params: [anyChannel, P("mode", "Do", "select", { opts: ["Add", "Remove"] })], risky: true, perm: "ManageGuild" },
  { id: "onb_toggle", group: "onb", name: "Turn onboarding on or off", desc: "", params: [P("mode", "Onboarding", "select", { opts: ["On", "Off"] })], risky: true, perm: "ManageGuild" },
  // ---- Server
  { id: "server_name", group: "srv", name: "Rename the server", desc: "", params: [P("name", "Name", "text", { req: true })], risky: true, perm: "ManageGuild" },
  { id: "server_image", group: "srv", name: "Change the icon or banner", desc: "From an image link", params: [P("which", "Change", "select", { opts: ["Icon", "Banner"] }), P("url", "Image link", "url", { req: true })], risky: true, perm: "ManageGuild" },
  { id: "server_channels", group: "srv", name: "Set the system or rules channel", desc: "", params: [P("which", "Which", "select", { opts: ["System (join messages)", "Rules", "Community updates"] }), P("channel", "Channel", "channel", { req: true })], risky: true, perm: "ManageGuild" },
  { id: "verification", group: "srv", name: "Set the verification level", desc: "", params: [P("level", "Level", "select", { opts: ["None", "Low", "Medium", "High", "Highest"] })], risky: true, perm: "ManageGuild" },
  { id: "content_filter", group: "srv", name: "Set the explicit content filter", desc: "", params: [P("level", "Scan media from", "select", { opts: ["Nobody", "Members without roles", "Everyone"] })], risky: true, perm: "ManageGuild" },
  { id: "pause", group: "srv", name: "Pause invites or DMs", desc: "Discord's raid tools, up to 24 hours", params: [P("what", "Pause", "select", { opts: ["Invites", "DMs", "Both"] }), P("for", "For (blank: undo)", "duration")], risky: true, perm: "ManageGuild" },
  { id: "lockdown", group: "srv", name: "Raid lockdown", desc: "Read-only chat and paused invites", params: [], risky: true, perm: "ManageGuild" },
  // ---- AutoMod
  { id: "automod_create", group: "auto", name: "Create an AutoMod rule", desc: "Block words, invite links, spam or mention spam", params: [P("name", "Rule name", "text", { req: true }), P("kind", "Blocks", "select", { opts: ["Words", "Invite links", "Spam", "Mention spam"] }), P("words", "Words (comma separated, for Words)", "text"), P("limit", "Mentions allowed (for Mention spam)", "number")], risky: true, perm: "ManageGuild" },
  { id: "automod_word", group: "auto", name: "Add or remove a blocked word", desc: "In a Words rule", params: [P("rule", "Rule name", "text", { req: true }), P("mode", "Do", "select", { opts: ["Add", "Remove"] }), P("word", "Word", "text", { req: true })], perm: "ManageGuild" },
  { id: "automod_toggle", group: "auto", name: "Turn an AutoMod rule on or off", desc: "", params: [P("rule", "Rule name", "text", { req: true }), P("mode", "Rule", "select", { opts: ["On", "Off"] })], risky: true, perm: "ManageGuild" },
  // ---- Events
  { id: "event_create", group: "evt", name: "Create a scheduled event", desc: "In a voice channel or somewhere else", params: [P("name", "Name", "text", { req: true }), P("in", "Starts in", "duration", { req: true }), P("voice", "Voice channel (blank: somewhere else)", "voice"), P("where", "Location (if not voice)", "text"), P("about", "Description", "longtext")], perm: "ManageEvents" },
  { id: "event_status", group: "evt", name: "Start, end or cancel an event", desc: "By its name", params: [P("name", "Event name", "text", { req: true }), P("mode", "Do", "select", { opts: ["Start", "End", "Cancel"] })], perm: "ManageEvents" },
  // ---- Emojis, stickers, webhooks
  { id: "emoji_add", group: "emo", name: "Add an emoji", desc: "From an image link", params: [P("name", "Name", "text", { req: true }), P("url", "Image link", "url", { req: true })], perm: "ManageGuildExpressions" },
  { id: "emoji_delete", group: "emo", name: "Delete an emoji", desc: "By name", params: [P("name", "Name", "text", { req: true })], risky: true, perm: "ManageGuildExpressions" },
  { id: "sticker_add", group: "emo", name: "Add a sticker", desc: "From a PNG link", params: [P("name", "Name", "text", { req: true }), P("url", "Image link", "url", { req: true }), P("tag", "Related emoji", "emoji", { req: true })], perm: "ManageGuildExpressions" },
  { id: "sticker_delete", group: "emo", name: "Delete a sticker", desc: "By name", params: [P("name", "Name", "text", { req: true })], risky: true, perm: "ManageGuildExpressions" },
  { id: "webhook_send", group: "emo", name: "Send as a webhook", desc: "Post with any name and picture", params: [channel, P("name", "Name", "text", { req: true }), P("avatar", "Picture link", "url"), P("text", "Message", "longtext", { req: true })], perm: "ManageWebhooks" },
  // ---- Spartacus
  { id: "coins", group: "sp", name: "Give or take coins", desc: "Use a minus number to take", params: [P("user", "Member", "user", { hint: "Blank: whoever ran it" }), P("amount", "Amount", "number", { req: true })], perm: "ManageGuild" },
  { id: "xp", group: "sp", name: "Give XP", desc: "", params: [P("user", "Member", "user", { hint: "Blank: whoever ran it" }), P("amount", "XP", "number", { req: true })], perm: "ManageGuild" },
  { id: "giveaway", group: "sp", name: "Start a giveaway", desc: "", params: [channel, P("prize", "Prize", "text", { req: true }), P("for", "Runs for", "duration", { req: true }), P("winners", "Winners", "number")], perm: "ManageGuild" },
  { id: "reminder", group: "sp", name: "Set a reminder", desc: "Pings them in this channel later", params: [P("user", "Who", "user", { hint: "Blank: whoever ran it" }), P("text", "Reminder", "text", { req: true }), P("in", "In", "duration", { req: true })] },
  { id: "module", group: "sp", name: "Turn a Spartacus module on or off", desc: "", params: [P("key", "Module", "select", { req: true, opts: [] }), P("mode", "Module", "select", { opts: ["On", "Off"] })], risky: true, perm: "ManageGuild" },
  { id: "tournament", group: "sp", name: "Open or start the next tournament", desc: "The newest one not finished", params: [P("mode", "Do", "select", { opts: ["Open registration", "Open check-in", "Start now"] })], risky: true, perm: "ManageGuild" },
  { id: "log", group: "sp", name: "Write to the Command Log", desc: "Your own line in the log", params: [P("text", "Line", "text", { req: true })] },
  // ---- Flow
  { id: "only_if", group: "flow", name: "Only continue if…", desc: "Otherwise stop here, with a message", params: [P("check", "Check", "select", { opts: ["They have a role", "They don't have a role", "Used in a channel", "An input is"] }), P("role", "Role", "role"), P("channel", "Channel", "anychannel"), P("input", "Input name", "text"), P("value", "Equals", "text"), P("otherwise", "Otherwise say", "text")] },
  { id: "confirm", group: "flow", name: "Ask to confirm first", desc: "Yes / Cancel before anything happens", params: [P("question", "Question", "text")] },
  { id: "wait", group: "flow", name: "Wait", desc: "Pause before the next step (up to 10 minutes)", params: [P("for", "For", "duration", { req: true })] },
  { id: "random", group: "flow", name: "Pick one at random", desc: "Run one of the next steps, chosen at random", params: [P("count", "From the next how many steps", "number", { req: true })] },
  { id: "stop", group: "flow", name: "Stop", desc: "End here", params: [P("text", "Say (optional)", "text")] },
];

export const ACTION_BY_ID: Record<string, ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

// ---- Inputs (Discord slash command options) ----
export const INPUT_TYPES = { member: "Member", role: "Role", channel: "Channel", text: "Text", number: "Number", yesno: "Yes or no", choice: "Choice list" } as const;
export type InputType = keyof typeof INPUT_TYPES;
export interface CommandInput {
  name: string; // lowercase, used as {name}
  type: InputType;
  description: string;
  required: boolean;
  choices: string[]; // for "choice"
}
export interface CommandStep {
  action: string;
  params: Record<string, string>;
}
export const COMMAND_ACCESS = { EVERYONE: "Everyone", ROLES: "Only some roles", MODS: "Moderators", ADMINS: "Admins" } as const;
export type CommandAccess = keyof typeof COMMAND_ACCESS;

export interface CommandDraft {
  name: string;
  description: string;
  enabled: boolean;
  access: CommandAccess;
  roleIds: string[];
  channelIds: string[];
  cooldownSec: number;
  checkPerms: boolean;
  skipConfirm: boolean;
  inputs: CommandInput[];
  steps: CommandStep[];
  reply: string;
  replyPublic: boolean;
  logChannelId: string | null;
}

export const COMMAND_LIMITS = { inputs: 25, steps: 25, reply: 1900, param: 1900 };
const NAME_RE = /^[a-z0-9_-]{1,32}$/;
const snowflake = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(snowflake).filter((x): x is string => !!x))].slice(0, 25) : []);

// Checks and tidies a command from the dashboard. Returns an error message
// when something can't be saved.
export function cleanCommand(b: Record<string, unknown>, moduleKeys: readonly string[] = []): CommandDraft | string {
  const name = typeof b.name === "string" ? b.name.trim().toLowerCase() : "";
  if (!NAME_RE.test(name)) return "The command name must be 1–32 lowercase letters, numbers, - or _ (no spaces).";
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 100) : "";
  if (!description) return "Add a short description. Discord shows it under the command name.";
  const inputs: CommandInput[] = [];
  for (const raw of Array.isArray(b.inputs) ? b.inputs : []) {
    const i = raw as Record<string, unknown>;
    const iname = typeof i.name === "string" ? i.name.trim().toLowerCase() : "";
    if (!NAME_RE.test(iname)) return `Input names must be lowercase letters, numbers, - or _ (“${iname || "blank"}”).`;
    if (iname === "me" || inputs.some((x) => x.name === iname)) return `Two inputs can't both be called “${iname}” (and “me” is taken).`;
    const type = typeof i.type === "string" && i.type in INPUT_TYPES ? (i.type as InputType) : "text";
    const choices = type === "choice" ? (Array.isArray(i.choices) ? i.choices : []).map((c) => String(c).trim().slice(0, 100)).filter(Boolean).slice(0, 25) : [];
    if (type === "choice" && choices.length < 2) return `The choice list “${iname}” needs at least 2 choices.`;
    inputs.push({ name: iname, type, description: (typeof i.description === "string" && i.description.trim().slice(0, 100)) || iname, required: !!i.required, choices });
    if (inputs.length > COMMAND_LIMITS.inputs) return `A command can have up to ${COMMAND_LIMITS.inputs} inputs.`;
  }
  const steps: CommandStep[] = [];
  for (const raw of Array.isArray(b.steps) ? b.steps : []) {
    const s = raw as Record<string, unknown>;
    const def = typeof s.action === "string" ? ACTION_BY_ID[s.action] : undefined;
    if (!def) return "One of the steps isn't a known action.";
    const given = (s.params && typeof s.params === "object" ? s.params : {}) as Record<string, unknown>;
    const params: Record<string, string> = {};
    for (const p of def.params) {
      const v = given[p.k];
      const text = Array.isArray(v) ? v.map(String).join(",") : v === undefined || v === null ? "" : String(v);
      params[p.k] = text.slice(0, COMMAND_LIMITS.param);
      if (p.req && !params[p.k].trim()) return `Step ${steps.length + 1} (${def.name}) needs “${p.label}”.`;
      if (p.type === "select" && params[p.k] && p.opts?.length && !p.opts.includes(params[p.k])) params[p.k] = p.opts[0];
    }
    if (def.id === "module" && params.key && moduleKeys.length && !moduleKeys.includes(params.key)) return `Step ${steps.length + 1}: pick a module from the list.`;
    steps.push({ action: def.id, params });
    if (steps.length > COMMAND_LIMITS.steps) return `A command can have up to ${COMMAND_LIMITS.steps} steps.`;
  }
  const reply = typeof b.reply === "string" ? b.reply.slice(0, COMMAND_LIMITS.reply) : "";
  if (!steps.length && !reply.trim()) return "Add at least one step, or a reply.";
  const access = typeof b.access === "string" && b.access in COMMAND_ACCESS ? (b.access as CommandAccess) : "EVERYONE";
  const roleIds = ids(b.roleIds);
  if (access === "ROLES" && !roleIds.length) return "Pick at least one role that can use it.";
  return {
    name,
    description,
    enabled: b.enabled !== false,
    access,
    roleIds,
    channelIds: ids(b.channelIds),
    cooldownSec: typeof b.cooldownSec === "number" && Number.isFinite(b.cooldownSec) ? Math.min(86_400, Math.max(0, Math.round(b.cooldownSec))) : 0,
    checkPerms: b.checkPerms !== false,
    skipConfirm: b.skipConfirm === true,
    inputs,
    steps,
    reply,
    replyPublic: b.replyPublic === true,
    logChannelId: snowflake(b.logChannelId),
  };
}

// Discord wants required options before optional ones.
const OPTION_TYPE: Record<InputType, number> = { member: 6, role: 8, channel: 7, text: 3, number: 10, yesno: 5, choice: 3 };
export function discordCommandBody(c: CommandDraft) {
  const options = [...c.inputs]
    .sort((a, b) => Number(b.required) - Number(a.required))
    .map((i) => ({
      type: OPTION_TYPE[i.type],
      name: i.name,
      description: i.description.slice(0, 100),
      required: i.required,
      ...(i.type === "choice" ? { choices: i.choices.map((x) => ({ name: x, value: x })) } : {}),
    }));
  const defaultPerms = c.access === "ADMINS" ? "8" : c.access === "MODS" ? String(1n << 40n) : null;
  return { name: c.name, description: c.description, options, default_member_permissions: defaultPerms, dm_permission: false };
}

// Parses 30s, 10m, 2h, 1d (a bare number is minutes) into milliseconds.
export function parseDuration(raw: string): number | null {
  const m = String(raw).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "m")[0];
  const ms = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 604_800_000;
  return Math.round(n * ms);
}
