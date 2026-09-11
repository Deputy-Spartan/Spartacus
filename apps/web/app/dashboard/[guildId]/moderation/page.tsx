"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { EmbedFields } from "../../../../components/ui/EmbedFields";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import {
  api,
  type AutomodConfig,
  type AutoPurgeConfigRow,
  type CommandToggleRow,
  type CustomCommandActionType,
  type CustomSlashCommandInput,
  type CustomSlashCommandRow,
  type DiscordChannelOption,
  type DiscordRoleOption,
  type LoggingConfig,
} from "../../../../lib/api";

type Tab = "automod" | "admin" | "audit" | "autopurge" | "commands";

const DEFAULT_CONFIG: AutomodConfig = {
  bannedWordsEnabled: false,
  bannedWords: [],
  repeatedTextEnabled: false,
  serverInvitesEnabled: false,
  externalLinksEnabled: false,
  excessiveCapsEnabled: false,
  excessiveEmojisEnabled: false,
  excessiveSpoilersEnabled: false,
  excessiveMentionsEnabled: false,
  immuneRoleIds: [],
  zalgoEnabled: false,
  antiSpamEnabled: true,
};

const CHECKS: Array<{ key: keyof AutomodConfig; label: string; hint: string }> = [
  { key: "antiSpamEnabled", label: "Anti-Spam", hint: "Removes messages when a member posts too fast (5+ in 7 seconds)." },
  { key: "externalLinksEnabled", label: "External Links", hint: "Removes messages containing any http(s) link." },
  { key: "serverInvitesEnabled", label: "Server Invites", hint: "Removes discord.gg / discord.com/invite links specifically." },
  { key: "excessiveCapsEnabled", label: "Excessive Caps", hint: "Removes messages that are 70%+ uppercase (10+ letters)." },
  { key: "excessiveEmojisEnabled", label: "Excessive Emojis", hint: "Removes messages with more than 8 emojis." },
  { key: "excessiveSpoilersEnabled", label: "Excessive Spoilers", hint: "Removes messages with more than 3 ||spoiler|| tags." },
  { key: "excessiveMentionsEnabled", label: "Excessive Mentions", hint: "Removes messages that @-mention more than 5 users/roles." },
  { key: "repeatedTextEnabled", label: "Repeated Text", hint: "Removes messages with a character repeated 10+ times in a row." },
  { key: "zalgoEnabled", label: "Zalgo Text", hint: "Removes messages using combining-character \"glitch\" text." },
];

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "automod", label: "Automod" },
  { key: "admin", label: "Admin" },
  { key: "audit", label: "Audit Log" },
  { key: "autopurge", label: "Auto Purge" },
  { key: "commands", label: "Commands" },
];

export default function ModerationPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("automod");
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AutomodConfig>(DEFAULT_CONFIG);
  const [bannedWordsInput, setBannedWordsInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getModeration(params.guildId).then(({ enabled, config }) => {
      setEnabled(enabled);
      setConfig(config);
      setBannedWordsInput(config.bannedWords.join(", "));
    });
  }, [params.guildId]);

  async function toggleModule(next: boolean) {
    setEnabled(next);
    await api.setModule(params.guildId, "MODERATION", next);
  }

  async function persist(next: AutomodConfig) {
    setConfig(next);
    setSaving(true);
    await api.setModeration(params.guildId, next);
    setSaving(false);
  }

  function toggleCheck(key: keyof AutomodConfig, value: boolean) {
    persist({ ...config, [key]: value });
  }

  async function saveBannedWords() {
    const words = bannedWordsInput
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    await persist({ ...config, bannedWords: words });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Moderator</h1>
          <p className="text-slate-400 mt-1">
            Automatic message filtering plus /kick /ban /mute /warn. {saving && <span className="text-slate-600">Saving…</span>}
          </p>
        </div>
        <ToggleSwitch enabled={enabled} onChange={toggleModule} label="Moderator module" />
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 text-sm border-b-2 transition-colors",
              tab === t.key ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "automod" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <NeonCard>
            <p className="font-medium mb-4">Automod Checks</p>
            <div className="divide-y divide-white/5">
              {CHECKS.map((c) => (
                <div key={c.key} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="pr-4">
                    <p className="text-sm text-slate-200">{c.label}</p>
                    <p className="text-xs text-slate-500">{c.hint}</p>
                  </div>
                  <ToggleSwitch enabled={Boolean(config[c.key])} onChange={(v) => toggleCheck(c.key, v)} label={c.label} />
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5 last:pb-0">
                <div className="pr-4">
                  <p className="text-sm text-slate-200">Ignore Other Bots</p>
                  <p className="text-xs text-slate-500">Automod never acts on messages from other bots.</p>
                </div>
                <ToggleSwitch enabled disabled onChange={() => {}} label="Ignore other bots (always on)" />
              </div>
            </div>
          </NeonCard>

          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium">Banned Words</p>
              <ToggleSwitch enabled={config.bannedWordsEnabled} onChange={(v) => toggleCheck("bannedWordsEnabled", v)} label="Banned words" />
            </div>
            <textarea
              className="w-full bg-base-950 border border-white/10 rounded-lg p-3 text-sm min-h-24 focus:outline-none focus:ring-1 focus:ring-neon-blue mb-3"
              placeholder="comma, separated, words"
              value={bannedWordsInput}
              onChange={(e) => setBannedWordsInput(e.target.value)}
              disabled={!config.bannedWordsEnabled}
            />
            <button onClick={saveBannedWords} disabled={!config.bannedWordsEnabled} className="neon-button-sm disabled:opacity-40">
              Save word list
            </button>
            <p className="text-xs text-slate-500 mt-3">Messages containing any of these are removed automatically.</p>
          </NeonCard>
        </div>
      )}

      {tab === "admin" && <AdminTab guildId={params.guildId} config={config} onChange={persist} />}
      {tab === "audit" && <AuditLogTab guildId={params.guildId} />}
      {tab === "autopurge" && <AutoPurgeTab guildId={params.guildId} />}
      {tab === "commands" && <CommandsTab guildId={params.guildId} />}
    </div>
  );
}

function AdminTab({ guildId, config, onChange }: { guildId: string; config: AutomodConfig; onChange: (next: AutomodConfig) => void }) {
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);

  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
  }, [guildId]);

  function roleName(roleId: string) {
    return roles.find((r) => r.id === roleId)?.name ?? roleId;
  }

  return (
    <NeonCard className="max-w-lg">
      <p className="font-medium mb-1">Immunity Roles</p>
      <p className="text-xs text-slate-500 mb-3">
        Members with any of these roles are skipped by every Automod check — server owners, admins, and bot roles
        typically go here.
      </p>

      <RoleSelect
        guildId={guildId}
        value={null}
        onChange={(roleId) => {
          if (!config.immuneRoleIds.includes(roleId)) onChange({ ...config, immuneRoleIds: [...config.immuneRoleIds, roleId] });
        }}
        placeholder="Add an immune role…"
      />

      {config.immuneRoleIds.length === 0 && <p className="text-xs text-slate-600">No immune roles yet.</p>}
      <div className="flex flex-wrap gap-1.5">
        {config.immuneRoleIds.map((roleId) => (
          <span key={roleId} className="flex items-center gap-1.5 bg-base-800 border border-white/10 rounded-full px-2.5 py-1 text-xs">
            <span className="text-neon-blue">@{roleName(roleId)}</span>
            <button
              onClick={() => onChange({ ...config, immuneRoleIds: config.immuneRoleIds.filter((r) => r !== roleId) })}
              className="text-slate-500 hover:text-rose-400"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </NeonCard>
  );
}

const AUDIT_LOG_SECTIONS: Array<{ title: string; icon: string; items: Array<[keyof LoggingConfig, string, string]> }> = [
  {
    title: "Moderation Events",
    icon: "🔨",
    items: [
      ["logMemberMuted", "Member muted", "Log when a member is timed out."],
      ["logMemberUnmuted", "Member unmuted", "Log when a member's timeout is removed."],
      ["logModerationBan", "Moderation ban", "Log when a member is banned via a mod command."],
      ["logModerationUnban", "Moderation unban", "Log when a member is unbanned via a mod command."],
    ],
  },
  {
    title: "Message Events",
    icon: "✎",
    items: [
      ["logEdits", "Message updated", "Log the before/after of edited messages."],
      ["logDeletes", "Message deleted", "Log deleted messages with author and channel."],
      ["logInvitePosted", "Invite posted", "Log when a new server invite is created."],
    ],
  },
  {
    title: "Member Events",
    icon: "👤",
    items: [
      ["logNicknameChanged", "Nickname changed", "Log nickname changes."],
      ["logMemberBanned", "Member banned", "Log when a member is banned (any source)."],
      ["logJoinsLeaves", "Member joined server", "Log every join and leave event."],
      ["logMemberUnbanned", "Member unbanned", "Log when a member is unbanned (any source)."],
      ["logUserUpdated", "User updated", "Log username/avatar changes."],
    ],
  },
  {
    title: "Role Events",
    icon: "🎭",
    items: [
      ["logRoleCreated", "Role created", "Log when a new role is created."],
      ["logRoleUpdated", "Role updated", "Log when a role's settings change."],
      ["logRoleDeleted", "Role deleted", "Log when a role is deleted."],
      ["logMemberRolesChanged", "Member roles changed", "Log when roles are added/removed from a member."],
    ],
  },
  {
    title: "Voice Events",
    icon: "🔊",
    items: [["logVoice", "Member joined/left voice channel", "Log voice channel join/leave/move events."]],
  },
  {
    title: "Server Events",
    icon: "⚙️",
    items: [
      ["logServerEdited", "Server edited", "Log changes to server name/icon/settings."],
      ["logEmojisUpdated", "Emojis updated", "Log emoji create/update/delete."],
    ],
  },
  {
    title: "Channel Events",
    icon: "📺",
    items: [
      ["logChannelCreated", "Channel created", "Log when a channel is created."],
      ["logChannelUpdated", "Channel updated", "Log when a channel is updated."],
      ["logChannelDeleted", "Channel deleted", "Log when a channel is deleted."],
    ],
  },
];

function IgnoredChannelsPicker({
  guildId,
  value,
  onChange,
}: {
  guildId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [channels, setChannels] = useState<DiscordChannelOption[]>([]);
  const [pick, setPick] = useState("");

  useEffect(() => {
    api.getDiscordChannels(guildId).then((result) => setChannels(result.textChannels));
  }, [guildId]);

  const available = channels.filter((c) => !value.includes(c.id));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((id) => {
          const channel = channels.find((c) => c.id === id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300"
            >
              #{channel?.name ?? id}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== id))}
                className="text-slate-500 hover:text-neon-blue"
              >
                ×
              </button>
            </span>
          );
        })}
        {value.length === 0 && <span className="text-xs text-slate-500">No ignored channels.</span>}
      </div>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={pick}
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
          setPick("");
        }}
      >
        <option value="">Add a channel to ignore…</option>
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function AuditLogTab({ guildId }: { guildId: string }) {
  const [config, setConfig] = useState<LoggingConfig | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    api.getLogging(guildId).then((loaded) => {
      setConfig(loaded);
      // Collapse any section with nothing turned on so the page opens tidy;
      // sections that already have active toggles stay open and visible.
      const initialCollapsed: Record<string, boolean> = {};
      for (const section of AUDIT_LOG_SECTIONS) {
        initialCollapsed[section.title] = !section.items.some(([key]) => Boolean(loaded[key]));
      }
      setCollapsed(initialCollapsed);
    });
  }, [guildId]);

  async function persist(next: LoggingConfig) {
    setConfig(next);
    setStatus("saving");
    try {
      const saved = await api.setLogging(guildId, next);
      setConfig(saved);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4 pb-16">
      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Log Channel</label>
        <ChannelSelect guildId={guildId} value={config.logChannelId} onChange={(channelId) => persist({ ...config, logChannelId: channelId })} />
      </NeonCard>

      {AUDIT_LOG_SECTIONS.map((section) => {
        const allOn = section.items.every(([key]) => Boolean(config[key]));
        const isCollapsed = collapsed[section.title];
        return (
          <NeonCard key={section.title} className="max-w-lg">
            <div className="flex items-center justify-between mb-1">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}
                className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-neon-blue transition-colors"
              >
                <span className={`inline-block text-slate-500 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▶</span>
                <span>{section.icon}</span>
                <span>{section.title}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { ...config };
                  for (const [key] of section.items) (next as Record<string, unknown>)[key] = !allOn;
                  persist(next);
                }}
                className="text-xs text-slate-500 hover:text-neon-blue transition-colors"
              >
                {allOn ? "Disable all" : "Enable all"}
              </button>
            </div>
            {!isCollapsed &&
              section.items.map(([key, label, desc]) => (
                <div key={key} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                  <ToggleSwitch enabled={Boolean(config[key])} onChange={(next) => persist({ ...config, [key]: next })} label={label} />
                </div>
              ))}
          </NeonCard>
        );
      })}

      <NeonCard className="max-w-lg">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <span>🚫</span>
          <span>Ignored</span>
        </h3>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ignored Channels</label>
        <IgnoredChannelsPicker
          guildId={guildId}
          value={config.ignoredChannelIds}
          onChange={(ids) => persist({ ...config, ignoredChannelIds: ids })}
        />

        <div className="flex items-center justify-between py-3 border-b border-white/5 mt-2">
          <div>
            <p className="text-sm font-medium">Don't log actions made by bots</p>
          </div>
          <ToggleSwitch enabled={config.ignoreBots} onChange={(v) => persist({ ...config, ignoreBots: v })} label="Ignore bots" />
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">Don't display user thumbnails</p>
          </div>
          <ToggleSwitch enabled={config.hideThumbnails} onChange={(v) => persist({ ...config, hideThumbnails: v })} label="Hide thumbnails" />
        </div>
      </NeonCard>

      <div className="fixed bottom-0 left-0 right-0 sm:left-64 z-20 flex justify-end px-6 py-3 bg-base-950/90 backdrop-blur border-t border-white/5">
        <span className="text-xs text-slate-500 flex items-center gap-2">
          {status === "saving" && <>Saving…</>}
          {status === "saved" && <span className="text-neon-blue">✓ All changes saved</span>}
          {status === "error" && <span className="text-red-400">⚠ Failed to save — try again</span>}
          {status === "idle" && <>Changes save automatically</>}
        </span>
      </div>
    </div>
  );
}

const EMPTY_AUTOPURGE = {
  intervalMinutes: 60,
  ignorePinned: true,
  ignoreImages: false,
  ignoreLinks: false,
  protectedEmojis: [] as string[],
};

function AutoPurgeTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [configs, setConfigs] = useState<AutoPurgeConfigRow[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_AUTOPURGE);
  const [emojiDraft, setEmojiDraft] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getAutoPurgeConfigs(guildId).then(setConfigs);
  }
  useEffect(refresh, [guildId]);

  async function create() {
    if (!channelId) {
      setError("Select a channel before saving.");
      return;
    }
    setError(null);
    await api.addAutoPurgeConfig(guildId, { channelId, ...form });
    setChannelId(null);
    setForm(EMPTY_AUTOPURGE);
    setShowForm(false);
    refresh();
  }

  async function update(row: AutoPurgeConfigRow, patch: Partial<AutoPurgeConfigRow>) {
    await api.updateAutoPurgeConfig(guildId, row.id, patch);
    refresh();
  }

  async function remove(row: AutoPurgeConfigRow) {
    if (!(await confirm(`Stop auto-purging #${row.channelId.slice(0, 6)}?`))) return;
    await api.deleteAutoPurgeConfig(guildId, row.id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 max-w-2xl">
          Automatically deletes messages in the channels below on a schedule — everything eligible up to Discord's 14-day bulk-delete
          limit, minus whatever you choose to protect.
        </p>
        <button
          onClick={() => {
            setError(null);
            setShowForm(true);
          }}
          className="neon-button-sm shrink-0"
        >
          + Add channel
        </button>
      </div>

      {showForm && (
        <NeonCard className="max-w-lg">
          <p className="font-medium mb-3">Auto-Purge a Channel</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Channel
            <Required />
          </label>
          <ChannelSelect guildId={guildId} value={channelId} onChange={setChannelId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Run every (minutes)</label>
          <input
            type="number"
            min={5}
            className="w-32 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={form.intervalMinutes}
            onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })}
          />

          <div className="mb-4">
            {[
              ["Skip pinned messages", "Never delete a pinned message.", form.ignorePinned, (v: boolean) => setForm({ ...form, ignorePinned: v })],
              ["Skip images", "Never delete messages with an image attachment.", form.ignoreImages, (v: boolean) => setForm({ ...form, ignoreImages: v })],
              ["Skip links", "Never delete messages containing a URL.", form.ignoreLinks, (v: boolean) => setForm({ ...form, ignoreLinks: v })],
            ].map(([label, hint, enabled, onChange]) => (
              <div key={label as string} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-b-0">
                <div>
                  <p className="text-sm text-slate-200">{label as string}</p>
                  <p className="text-xs text-slate-500">{hint as string}</p>
                </div>
                <ToggleSwitch enabled={enabled as boolean} onChange={onChange as (v: boolean) => void} label={label as string} />
              </div>
            ))}
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Skip messages reacted with</label>
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              placeholder="Emoji, e.g. ⭐"
              value={emojiDraft}
              onChange={(e) => setEmojiDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emojiDraft.trim()) {
                  setForm({ ...form, protectedEmojis: [...form.protectedEmojis, emojiDraft.trim()] });
                  setEmojiDraft("");
                }
              }}
            />
          </div>
          {form.protectedEmojis.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {form.protectedEmojis.map((e) => (
                <span key={e} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                  {e}
                  <button onClick={() => setForm({ ...form, protectedEmojis: form.protectedEmojis.filter((x) => x !== e) })} className="text-slate-500 hover:text-rose-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={create} disabled={!channelId} className="neon-button disabled:opacity-50">
              Save
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard className="max-w-lg">
        {configs.length === 0 ? (
          <p className="text-sm text-slate-500">No channels are being auto-purged yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">#{c.channelId.slice(0, 6)}</p>
                  <p className="text-xs text-slate-500">
                    every {c.intervalMinutes}m
                    {c.ignorePinned ? " · skips pinned" : ""}
                    {c.ignoreImages ? " · skips images" : ""}
                    {c.ignoreLinks ? " · skips links" : ""}
                    {c.protectedEmojis.length > 0 ? ` · protects ${c.protectedEmojis.join(" ")}` : ""}
                    {c.lastRunAt ? ` · last ran ${new Date(c.lastRunAt).toLocaleString()}` : " · not run yet"}
                  </p>
                </div>
                <button onClick={() => remove(c)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </NeonCard>
    </div>
  );
}

const ACTION_OPTIONS: Array<{ value: CustomCommandActionType; label: string; hint: string }> = [
  { value: "SEND_MESSAGE", label: "Send a message", hint: "Replies with a fixed message you write." },
  { value: "POST_EMBED", label: "Post an embed", hint: "Replies with a fixed embed you design." },
  { value: "GIVE_ROLE", label: "Give a role", hint: "Gives a role to the invoker, or a target member." },
  { value: "REMOVE_ROLE", label: "Remove a role", hint: "Removes a role from the invoker, or a target member." },
  { value: "ADD_CURRENCY", label: "Add currency", hint: "Gives a fixed amount of Economy currency to a target member." },
];

const EMPTY_CUSTOM_COMMAND: CustomSlashCommandInput = {
  name: "",
  description: "",
  actionType: "SEND_MESSAGE",
  ephemeralReply: true,
  messageText: "",
  embedEnabled: false,
  embedTitle: "",
  embedColor: "#5865F2",
  buttons: [],
  embedExtra: {},
  savedEmbedId: null,
};

function CommandsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [commands, setCommands] = useState<CommandToggleRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [customCommands, setCustomCommands] = useState<CustomSlashCommandRow[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState<CustomSlashCommandInput>(EMPTY_CUSTOM_COMMAND);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshToggles() {
    api.getCommandToggles(guildId).then(setCommands);
  }
  function refreshCustom() {
    api.getCustomSlashCommands(guildId).then(setCustomCommands);
  }
  useEffect(refreshToggles, [guildId]);
  useEffect(refreshCustom, [guildId]);

  async function toggle(name: string, next: boolean) {
    setCommands((prev) => (prev ? prev.map((c) => (c.name === name ? { ...c, enabled: next } : c)) : prev));
    await api.setCommandToggle(guildId, name, next).catch(() => {
      setCommands((prev) => (prev ? prev.map((c) => (c.name === name ? { ...c, enabled: !next } : c)) : prev));
    });
  }

  async function createCommand() {
    if (!form.name || !form.description) {
      setError("Enter a command name and description before creating.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.createCustomSlashCommand(guildId, form);
      setForm(EMPTY_CUSTOM_COMMAND);
      setShowBuilder(false);
      refreshCustom();
      refreshToggles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create command");
    }
    setCreating(false);
  }

  async function removeCustom(id: string) {
    if (!(await confirm("Delete this custom slash command? It will be removed from Discord immediately.", { danger: true }))) return;
    await api.deleteCustomSlashCommand(guildId, id);
    refreshCustom();
    refreshToggles();
  }

  const filtered = commands?.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <NeonCard>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium">Your Custom Commands</p>
          <button
            onClick={() => {
              setError(null);
              setShowBuilder(true);
            }}
            className="neon-button-sm"
          >
            + New Command
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Build a brand-new slash command that runs one preset action — registers instantly as a real Discord command
          in this server.
        </p>
        {customCommands.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
        <div className="divide-y divide-white/5">
          {customCommands.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <p className="text-neon-blue font-medium">/{c.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {ACTION_OPTIONS.find((a) => a.value === c.actionType)?.label} — {c.description}
                </p>
              </div>
              <button onClick={() => removeCustom(c.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                Remove
              </button>
            </div>
          ))}
        </div>
      </NeonCard>

      {showBuilder && (
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">New Custom Command</p>
            <button onClick={() => setShowBuilder(false)} className="text-slate-500 hover:text-slate-300 text-xs">
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                Command Name
                <Required />
              </label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                placeholder="my-command"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                Description
                <Required />
              </label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                placeholder="Shown in Discord's command picker"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Action</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {ACTION_OPTIONS.map((a) => (
              <button
                key={a.value}
                onClick={() => setForm({ ...form, actionType: a.value })}
                className={[
                  "text-left rounded-lg p-3 border transition-colors",
                  form.actionType === a.value ? "border-neon-blue bg-base-800 shadow-glow-blue" : "border-white/10 bg-base-950 hover:border-white/20",
                ].join(" ")}
              >
                <p className="text-sm text-slate-200">{a.label}</p>
                <p className="text-xs text-slate-500">{a.hint}</p>
              </button>
            ))}
          </div>

          {form.actionType === "SEND_MESSAGE" && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Message</label>
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20"
                value={form.messageText}
                onChange={(e) => setForm({ ...form, messageText: e.target.value })}
              />
            </div>
          )}

          {form.actionType === "POST_EMBED" && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Fallback Text</label>
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16 mb-4"
                value={form.messageText}
                onChange={(e) => setForm({ ...form, messageText: e.target.value })}
              />
              <EmbedFields
                guildId={guildId}
                embedEnabled={form.embedEnabled ?? true}
                embedTitle={form.embedTitle ?? ""}
                embedColor={form.embedColor ?? "#5865F2"}
                buttons={form.buttons ?? []}
                onChange={(next) => setForm({ ...form, ...next })}
              />
              <EmbedExtraFields
                value={form.embedExtra ?? {}}
                onChange={(v) => setForm({ ...form, embedExtra: v })}
              />
              <SavedEmbedPicker guildId={guildId} value={form.savedEmbedId ?? null} onChange={(id) => setForm({ ...form, savedEmbedId: id })} />
            </div>
          )}

          {(form.actionType === "GIVE_ROLE" || form.actionType === "REMOVE_ROLE") && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Role</label>
              <RoleSelect guildId={guildId} value={form.roleId ?? null} onChange={(roleId) => setForm({ ...form, roleId })} />
              <p className="text-xs text-slate-600 -mt-3">Whoever runs the command can optionally target another member — otherwise it applies to themselves.</p>
            </div>
          )}

          {form.actionType === "ADD_CURRENCY" && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Amount</label>
              <input
                type="number"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={form.currencyAmount ?? 0}
                onChange={(e) => setForm({ ...form, currencyAmount: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-600 mt-1">Whoever runs the command must pick a member to give currency to.</p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-300">Reply privately (only the user who ran it sees the response)</span>
            <ToggleSwitch enabled={form.ephemeralReply} onChange={(v) => setForm({ ...form, ephemeralReply: v })} />
          </div>

          <button onClick={createCommand} disabled={creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Command"}
          </button>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard>
        <p className="font-medium mb-3">All Commands</p>
        <input
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!commands && <p className="text-sm text-slate-500">Loading…</p>}
        {commands && filtered?.length === 0 && <p className="text-sm text-slate-500">No commands match "{query}".</p>}
        <div className="divide-y divide-white/5">
          {filtered?.map((c) => (
            <div key={c.name} className="flex items-center justify-between py-2.5 gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">
                  /{c.name}
                  {c.moduleKey && <span className="text-slate-600 text-xs ml-2">{c.moduleKey}</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">{c.description}</p>
              </div>
              <ToggleSwitch enabled={c.enabled} onChange={(v) => toggle(c.name, v)} label={`Toggle /${c.name}`} />
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
