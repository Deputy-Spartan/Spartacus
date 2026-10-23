"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { AvatarCropper } from "../../../../components/ui/AvatarCropper";
import { api, type BotConfigRow } from "../../../../lib/api";
import { useOwnerGuard } from "../../../../lib/useOwnerGuard";

const STATUS_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do Not Disturb" },
  { value: "invisible", label: "Invisible" },
];

const ACTIVITY_OPTIONS = [
  { value: "PLAYING", label: "Playing" },
  { value: "WATCHING", label: "Watching" },
  { value: "LISTENING", label: "Listening to" },
  { value: "COMPETING", label: "Competing in" },
  { value: "CUSTOM", label: "Custom status" },
];

type Tab = "identity" | "status" | "support-dm" | "tickets" | "applications" | "reaction-roles" | "welcome" | "moderation" | "giveaways" | "announcements";

interface RailItem {
  key: Tab;
  label: string;
  icon: string;
}

const GENERAL_ITEMS: RailItem[] = [
  { key: "identity", label: "Identity", icon: "🪪" },
  { key: "status", label: "Status & Activity", icon: "💡" },
];

// Every module gets a reserved tab even with nothing configurable yet, so an
// account-wide setting added to any of them later has an obvious home
// instead of getting bolted onto whichever tab happens to be open already.
const MODULE_ITEMS: RailItem[] = [
  { key: "support-dm", label: "Support DM", icon: "📨" },
  { key: "tickets", label: "Tickets", icon: "🎟️" },
  { key: "applications", label: "Applications", icon: "📝" },
  { key: "reaction-roles", label: "Reaction Roles", icon: "🎭" },
  { key: "welcome", label: "Welcome & Goodbye", icon: "👋" },
  { key: "moderation", label: "Moderation", icon: "🛡️" },
  { key: "giveaways", label: "Giveaways", icon: "🎁" },
  { key: "announcements", label: "Announcements", icon: "📢" },
];

const EMPTY_MODULE_COPY: Partial<Record<Tab, string>> = {
  tickets: "Panels, categories, and roles are all per-server — that's on each server's own Tickets page.",
  applications: "Review channels, question sets, and accept/deny messages are all per-server.",
  "reaction-roles": "Panels and role mappings are all per-server.",
  welcome: "Messages, channels, and embeds are all per-server.",
  moderation: "Automod rules, log channels, and punishments are all per-server.",
  giveaways: "Giveaway setup is all per-server.",
  announcements: "Scheduling and embeds are all per-server.",
};

function EmptyModuleTab({ icon, label, copy }: { icon: string; label: string; copy: string }) {
  return (
    <NeonCard>
      <div className="text-center py-10 px-6">
        <div className="text-2xl mb-2.5">{icon}</div>
        <p className="text-sm text-slate-400 mb-1">{label} has no account-wide settings right now.</p>
        <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">{copy} This tab's here so a future account-wide setting has a home.</p>
      </div>
    </NeonCard>
  );
}

export default function BotCustomizationPage({ params }: { params: { guildId: string } }) {
  const ownerAccess = useOwnerGuard(params.guildId);
  const [tab, setTab] = useState<Tab>("identity");
  const [search, setSearch] = useState("");
  const [config, setConfig] = useState<BotConfigRow | null>(null);
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [statusType, setStatusType] = useState("online");
  const [activityType, setActivityType] = useState("PLAYING");
  const [activityText, setActivityText] = useState("");
  const [serverPickerMessage, setServerPickerMessage] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarDataUri, setAvatarDataUri] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<string | null>(null); // set while the crop modal is open

  useEffect(() => {
    api.getBotConfig().then((c) => {
      setConfig(c);
      setUsername(c.username ?? "");
      setDescription(c.description ?? "");
      setStatusType(c.statusType);
      setActivityType(c.activityType);
      setActivityText(c.activityText ?? "");
      setAvatarPreview(c.avatarUrl);
      setServerPickerMessage(c.supportServerPickerMessage ?? "");
    });
  }, []);

  function onAvatarFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result as string);
    reader.readAsDataURL(file);
  }

  function onCropSaved(dataUri: string) {
    setAvatarPreview(dataUri);
    setAvatarDataUri(dataUri);
    setCropSource(null);
  }

  async function save() {
    setSaving(true);
    setErrors([]);
    setSaved(false);
    const result = await api.setBotConfig({
      username: username || undefined,
      avatarDataUri,
      description,
      statusType,
      activityType,
      activityText,
      supportServerPickerMessage: serverPickerMessage || null,
    });
    setSaving(false);
    if (result.errors.length > 0) {
      setErrors(result.errors);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  if (ownerAccess !== "allowed" || !config) {
    return <p className="text-sm text-slate-500">{ownerAccess === "checking" ? "Checking access…" : "Loading…"}</p>;
  }

  const configuredDot = (key: Tab) => (key === "support-dm" ? !!serverPickerMessage.trim() : false);
  const q = search.trim().toLowerCase();
  const filterItem = (item: RailItem) => !q || item.label.toLowerCase().includes(q);

  function RailButton({ item }: { item: RailItem }) {
    const hasConfig = MODULE_ITEMS.some((m) => m.key === item.key);
    return (
      <button
        onClick={() => setTab(item.key)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left mb-0.5 ${
          tab === item.key ? "bg-neon-blue/10 text-neon-blue font-medium" : "text-slate-400 hover:bg-base-800 hover:text-slate-200"
        }`}
      >
        <span className="w-5 text-center shrink-0">{item.icon}</span>
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
        {hasConfig && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${configuredDot(item.key) ? "bg-emerald-400" : "bg-slate-600"}`}
            title={configuredDot(item.key) ? "Has a custom message set" : "Using defaults"}
          />
        )}
      </button>
    );
  }

  return (
    <div>
      <span className="inline-flex items-center gap-1 bg-purple-500/15 text-purple-300 text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-2">
        🔑 Owner only
      </span>
      <h1 className="text-2xl font-bold mb-1">Bot Customization</h1>
      <p className="text-slate-400 mb-6 max-w-2xl">
        Account-wide settings — the same across every server the bot is in, and only visible to people with access to this panel. General identity and
        status live up top; each module below gets its own tab for the account-wide settings only it needs. Looking to force the bot online/offline or
        post a maintenance message?{" "}
        <Link href={`/dashboard/${params.guildId}/status-channel`} className="text-neon-blue hover:underline">
          That's on the Status Channel page
        </Link>
        .
      </p>

      {errors.length > 0 && (
        <div className="mb-4 bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-300 space-y-1">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-5 items-start">
        <nav className="w-full md:w-56 shrink-0 md:sticky md:top-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings…"
            className="w-full bg-base-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs mb-3"
          />

          <p className="text-[10.5px] uppercase tracking-wide text-slate-600 px-2.5 mb-1.5">General</p>
          {GENERAL_ITEMS.filter(filterItem).map((item) => (
            <RailButton key={item.key} item={item} />
          ))}

          <p className="text-[10.5px] uppercase tracking-wide text-slate-600 px-2.5 mb-1.5 mt-3 flex items-center justify-between">
            Modules <span className="bg-base-800 text-slate-600 text-[10px] px-1.5 rounded-full">{MODULE_ITEMS.length}</span>
          </p>
          {MODULE_ITEMS.filter(filterItem).map((item) => (
            <RailButton key={item.key} item={item} />
          ))}
        </nav>

        <div className="flex-1 min-w-0 w-full">
          {tab === "identity" && (
            <NeonCard>
              <p className="font-medium mb-4">Identity</p>

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Avatar</label>
              <div className="flex items-center gap-4 mb-4">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-base-800 flex items-center justify-center text-slate-600 text-2xl">🤖</div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAvatarFile(file);
                  }}
                />
                <div className="flex flex-col gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="neon-button-sm">
                    Choose Image
                  </button>
                  {avatarDataUri && (
                    <button onClick={() => setCropSource(avatarDataUri)} className="text-xs text-slate-500 hover:text-neon-blue text-left">
                      Adjust position &amp; zoom
                    </button>
                  )}
                </div>
              </div>

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Bot Username</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Spartacus"
              />

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-24"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Shown on the bot's Discord profile / invite page."
              />
            </NeonCard>
          )}

          {tab === "status" && (
            <NeonCard>
              <p className="font-medium mb-4">Status & Activity</p>

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Status</label>
              <select
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                value={statusType}
                onChange={(e) => setStatusType(e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Activity Type</label>
              <select
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
              >
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                {activityType === "CUSTOM" ? "Custom Status Text" : `${ACTIVITY_OPTIONS.find((o) => o.value === activityType)?.label} …`}
              </label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-2"
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                placeholder="e.g. with 200 servers"
              />
              <p className="text-xs text-slate-600">Status/activity changes can take up to 30 seconds to appear in Discord.</p>
            </NeonCard>
          )}

          {tab === "support-dm" && (
            <NeonCard>
              <p className="font-medium mb-1">Support DM — Multi-Server Picker Message</p>
              <p className="text-xs text-slate-500 mb-4">
                Sent when a member DMs the bot and shares more than one server with Support DM Intake enabled, before they've picked which one it's about.
                It's account-wide since it's shown before any single server is chosen — once they pick one, that server's own Opening Message takes
                over, editable from{" "}
                <Link href={`/dashboard/${params.guildId}/support-intake`} className="text-neon-blue hover:underline">
                  Support DM → Settings
                </Link>
                .
              </p>
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-1"
                rows={2}
                value={serverPickerMessage}
                onChange={(e) => setServerPickerMessage(e.target.value)}
                placeholder="👋 You're in a few servers I can help with — which one is this about?"
              />
              <p className="text-xs text-slate-600">Leave blank to use the default wording shown above.</p>
            </NeonCard>
          )}

          {tab !== "identity" && tab !== "status" && tab !== "support-dm" && (
            <EmptyModuleTab
              icon={MODULE_ITEMS.find((m) => m.key === tab)?.icon ?? ""}
              label={MODULE_ITEMS.find((m) => m.key === tab)?.label ?? ""}
              copy={EMPTY_MODULE_COPY[tab] ?? ""}
            />
          )}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4 disabled:opacity-50">
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
      </button>
      <p className="text-xs text-slate-600 mt-1.5">Saves changes across every tab at once.</p>

      {cropSource && <AvatarCropper imageSrc={cropSource} onCancel={() => setCropSource(null)} onSave={onCropSaved} />}
    </div>
  );
}
