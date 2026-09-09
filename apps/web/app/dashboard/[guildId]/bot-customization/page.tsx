"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { api, type BotConfigRow } from "../../../../lib/api";

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

export default function BotCustomizationPage() {
  const [config, setConfig] = useState<BotConfigRow | null>(null);
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [statusType, setStatusType] = useState("online");
  const [activityType, setActivityType] = useState("PLAYING");
  const [activityText, setActivityText] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarDataUri, setAvatarDataUri] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getBotConfig().then((c) => {
      setConfig(c);
      setUsername(c.username ?? "");
      setDescription(c.description ?? "");
      setStatusType(c.statusType);
      setActivityType(c.activityType);
      setActivityText(c.activityText ?? "");
      setAvatarPreview(c.avatarUrl);
    });
  }, []);

  function onAvatarFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setAvatarPreview(dataUri);
      setAvatarDataUri(dataUri);
    };
    reader.readAsDataURL(file);
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
    });
    setSaving(false);
    if (result.errors.length > 0) {
      setErrors(result.errors);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  if (!config) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Bot Customization</h1>
      <p className="text-slate-400 mb-6">
        These are account-wide — the bot's username, avatar, status, and description are the same across every server it's in.
      </p>

      {errors.length > 0 && (
        <div className="mb-4 bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-300 space-y-1">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-4">Identity</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Avatar</label>
          <div className="flex items-center gap-4 mb-4">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-base-800 flex items-center justify-center text-slate-600 text-2xl">
                🤖
              </div>
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
            <button onClick={() => fileInputRef.current?.click()} className="neon-button-sm">
              Choose Image
            </button>
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
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4 disabled:opacity-50">
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
      </button>
    </div>
  );
}
