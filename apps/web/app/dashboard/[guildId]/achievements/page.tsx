"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelOverrideField } from "../../../../components/ui/ChannelOverrideField";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import {
  api,
  type AchievementRow,
  type AchievementSettingsRow,
  type CustomAchievementRow,
  type CustomAchievementInput,
  type CustomAchievementTrigger,
} from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";

const ACHIEVEMENT_LABELS: Record<string, string> = {
  FIRST_MESSAGE: "First Message",
  LEVEL_10: "Level 10",
  LEVEL_25: "Level 25",
  LEVEL_50: "Level 50",
  STREAK_7: "7-Day Streak",
  STREAK_30: "30-Day Streak",
  VOICE_10H: "10 Hours in Voice",
  VOICE_50H: "50 Hours in Voice",
};

const TRIGGER_LABELS: Record<CustomAchievementTrigger, string> = {
  LEVEL: "Reaches Level",
  VOICE_HOURS: "Hours in Voice",
  DAILY_STREAK: "Daily-Claim Streak (days)",
};

function AnnouncementSettings({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<AchievementSettingsRow | null>(null);

  useEffect(() => {
    api.getAchievementSettings(guildId).then(setSettings);
  }, [guildId]);

  const autoSave = useAutoSave(settings, async () => {
    if (settings) setSettings(await api.setAchievementSettings(guildId, settings));
  });

  if (!settings) return null;

  return (
    <NeonCard className="max-w-lg mb-5">
      <p className="font-medium mb-1">Achievement Announcements</p>
      <ChannelOverrideField
        guildId={guildId}
        value={settings.channelId}
        onChange={(id) => setSettings({ ...settings, channelId: id })}
        label="Post to a specific channel"
        fallbackNote="Off — achievements post in whatever channel the action that earned them happened in."
      />
      <SaveStatus status={autoSave} />
    </NeonCard>
  );
}

const EMPTY_ACHIEVEMENT: CustomAchievementInput = { name: "", emoji: "🏆", triggerType: "LEVEL", threshold: 10 };

function CustomAchievements({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<CustomAchievementRow[]>([]);
  const [draft, setDraft] = useState<CustomAchievementInput>(EMPTY_ACHIEVEMENT);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getCustomAchievements(guildId).then(setRows);
  }
  useEffect(refresh, [guildId]);

  async function add() {
    if (!draft.name.trim()) return setError("Enter a name for this achievement.");
    if (!draft.threshold || draft.threshold <= 0) return setError("Threshold must be a positive number.");
    setCreating(true);
    setError(null);
    try {
      await api.addCustomAchievement(guildId, { ...draft, name: draft.name.trim(), emoji: draft.emoji?.trim() || "🏆" });
      setDraft(EMPTY_ACHIEVEMENT);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create achievement");
    }
    setCreating(false);
  }

  async function remove(id: string, name: string) {
    if (!(await confirm(`Delete the "${name}" achievement? Anyone who already earned it keeps it on record, but nobody new will.`))) return;
    await api.deleteCustomAchievement(guildId, id);
    refresh();
  }

  return (
    <NeonCard className="max-w-lg mb-5">
      <p className="font-medium mb-1">Custom Achievements</p>
      <p className="text-xs text-slate-500 mb-3">
        Add your own milestones on top of the built-in ones — any level, any voice-hour total, any streak length.
      </p>

      <div className="space-y-2 mb-4">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-base-950 border border-white/10 text-sm">
            <span className="min-w-0 truncate">
              {r.emoji} <span className="font-medium">{r.name}</span>{" "}
              <span className="text-xs text-slate-500">
                — {TRIGGER_LABELS[r.triggerType]} {r.threshold}
              </span>
            </span>
            <button onClick={() => remove(r.id, r.name)} className="text-xs text-slate-500 hover:text-rose-400 shrink-0">
              Remove
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-600">No custom achievements yet.</p>}
      </div>

      <div className="rounded-lg border border-white/10 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 mb-2">
          <input
            className="w-16 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm text-center"
            value={draft.emoji}
            onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
          />
          <input
            className="bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            placeholder="Achievement name, e.g. Diamond Rank"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <select
            className="bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            value={draft.triggerType}
            onChange={(e) => setDraft({ ...draft, triggerType: e.target.value as CustomAchievementTrigger })}
          >
            {(Object.keys(TRIGGER_LABELS) as CustomAchievementTrigger[]).map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className="bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            placeholder="Threshold"
            value={draft.threshold}
            onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })}
          />
        </div>
        <button onClick={add} disabled={creating} className="neon-button-sm disabled:opacity-50">
          {creating ? "Creating…" : "+ Add Achievement"}
        </button>
        <FormError message={error} />
      </div>
    </NeonCard>
  );
}

export default function AchievementsPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<AchievementRow[] | null>(null);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getAchievements(params.guildId).then(setRows);
    api.getCustomAchievements(params.guildId).then((list) => setCustomLabels(Object.fromEntries(list.map((c) => [c.id, `${c.emoji} ${c.name}`]))));
  }, [params.guildId]);

  function labelFor(type: string): string {
    if (ACHIEVEMENT_LABELS[type]) return ACHIEVEMENT_LABELS[type];
    if (type.startsWith("CUSTOM:")) return customLabels[type.slice(7)] ?? "Custom achievement (deleted)";
    return type;
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ACHIEVEMENTS"
        title="Achievements"
        description="Milestones members unlock automatically — first messages, level thresholds, daily-claim streaks, voice-time totals, and any custom ones you add below."
      />

      <AnnouncementSettings guildId={params.guildId} />
      <CustomAchievements guildId={params.guildId} />

      <NeonCard>
        <p className="font-medium mb-3">Recently Awarded</p>
        {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">No achievements awarded yet.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <span className="text-slate-300 truncate flex-1">{r.userId}</span>
              <span className="text-neon-blue shrink-0">{labelFor(r.type)}</span>
              <span className="text-xs text-slate-600 shrink-0">{new Date(r.awardedAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
