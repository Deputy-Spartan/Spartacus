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

export default function BotCustomizationPage({ params }: { params: { guildId: string } }) {
  const ownerAccess = useOwnerGuard(params.guildId);
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Bot Customization</h1>
      <p className="text-slate-400 mb-6">
        These are account-wide — the bot's username, avatar, status, and description are the same across every server it's in. Looking to force
        the bot online/offline or post a maintenance message?{" "}
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

        <NeonCard className="lg:col-span-2">
          <p className="font-medium mb-1">Support DM — Server Picker Message</p>
          <p className="text-xs text-slate-500 mb-4">
            Sent when a member DMs the bot and shares more than one server with Support DM Intake enabled, before they've picked which one it's about.
            It's account-wide (like everything else on this page) since it's shown before any single server is chosen — once they pick one, that
            server's own Opening Message takes over, editable from{" "}
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
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4 disabled:opacity-50">
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
      </button>

      {cropSource && <AvatarCropper imageSrc={cropSource} onCancel={() => setCropSource(null)} onSave={onCropSaved} />}
    </div>
  );
}
