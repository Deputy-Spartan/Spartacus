"use client";

import { useEffect, useState } from "react";
import { MAX_PROFILE_STATS, PROFILE_STATS, PROFILE_THEMES, type ProfileStatKey } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type ProfileCardSettingsRow } from "../../../../lib/api";

export default function ProfileCardsPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [settings, setSettings] = useState<ProfileCardSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    api.getProfileCardSettings(guildId).then(setSettings);
  }, [guildId]);

  async function persist(next: ProfileCardSettingsRow) {
    setSettings(next);
    setSaving(true);
    try {
      setSettings(await api.setProfileCardSettings(guildId, next));
    } finally {
      setSaving(false);
    }
  }

  async function loadPreview() {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const url = await api.getProfileCardPreview(guildId);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Couldn't draw the preview.");
    } finally {
      setLoadingPreview(false);
    }
  }

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  const toggle = (k: ProfileStatKey) => {
    const on = settings.stats.includes(k);
    if (!on && settings.stats.length >= MAX_PROFILE_STATS) return;
    persist({ ...settings, stats: on ? settings.stats.filter((s) => s !== k) : [...settings.stats, k] });
  };

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="PROFILE_CARDS"
        title="Profile Cards"
        description="/profile shows a card members can make their own: a title, a short bio, a theme, their best badges and the games they play, with their level and stats. /profile @someone shows theirs, and Compare puts two side by side."
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <NeonCard>
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium">Stats on the card</p>
              {saving && <span className="text-xs text-slate-600">Saving…</span>}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Pick up to {MAX_PROFILE_STATS}. They show in this order. The level and XP bar always show. ({settings.stats.length}/{MAX_PROFILE_STATS})
            </p>
            <div className="space-y-2">
              {(Object.keys(PROFILE_STATS) as ProfileStatKey[]).map((k) => {
                const on = settings.stats.includes(k);
                const full = !on && settings.stats.length >= MAX_PROFILE_STATS;
                return (
                  <label key={k} className={`flex items-center gap-2 text-sm ${full ? "text-slate-600" : "text-slate-300"}`}>
                    <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(k)} />
                    {PROFILE_STATS[k]}
                  </label>
                );
              })}
            </div>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-3">Bios</p>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={settings.allowBios} onChange={(e) => persist({ ...settings, allowBios: e.target.checked })} />
              Let members write a short bio (up to 80 characters)
            </label>
            <p className="text-xs text-slate-500 mt-2">Bios can't have links or mentions, and are checked against AutoMod's banned words when Moderation is on.</p>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-2">How members customise their card</p>
            <ul className="text-sm text-slate-300 space-y-1.5 list-disc pl-5">
              <li>
                Press <b>✏️ Edit my card</b> under any card. Only they see the menu: title, theme, up to 3 badges, up to 3 games, and a bio. Changes save straight away, and <b>Preview</b> shows the result.
              </li>
              <li>
                <b>Badges</b> are achievements they've earned (from the Achievements module), including your custom ones with their emoji.
              </li>
              <li>
                <b>Themes:</b>{" "}
                {PROFILE_THEMES.map((t) => `${t.name} (${t.cost ? `${t.cost.toLocaleString("en-US")} coins` : t.unlockLevel ? `level ${t.unlockLevel}` : "free"})`).join(", ")}. Buying needs Economy turned on.
              </li>
            </ul>
          </NeonCard>
        </div>

        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">Preview: your own card</p>
            <button type="button" onClick={loadPreview} disabled={loadingPreview} className="neon-button-sm">
              {loadingPreview ? "Drawing…" : preview ? "Refresh" : "Show my card"}
            </button>
          </div>
          {previewError && <p className="text-sm text-rose-400">{previewError}</p>}
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your profile card" className="w-full rounded-xl" />
          ) : (
            <p className="text-sm text-slate-500">Draws your card in this server exactly as /profile would, with the settings on the left.</p>
          )}
        </NeonCard>
      </div>
    </div>
  );
}
