"use client";

import { useEffect, useState } from "react";
import { MAX_PROFILE_STATS, PROFILE_PANEL_DEFAULTS, PROFILE_STATS, PROFILE_THEMES, type ProfileStatKey } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
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

  const [panelError, setPanelError] = useState<string | null>(null);
  async function persist(next: ProfileCardSettingsRow, repost = false) {
    setSettings(next);
    setSaving(true);
    try {
      const saved = await api.setProfileCardSettings(guildId, { ...next, repost });
      setSettings(saved);
      setPanelError(saved.panelError ?? null);
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
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium">Button Panel</p>
              {settings.panelChannelId && (
                <span className={`text-xs ${settings.panelPosted ? "text-emerald-400" : "text-amber-300"}`}>{settings.panelPosted ? "● Posted" : "● Posting…"}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              An embed in a channel with two buttons, so members don't need /profile: <b>🪪 My card</b> and <b>🔍 Someone's card</b> (pick any member from a list).
            </p>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
            <ChannelSelect guildId={guildId} value={settings.panelChannelId} onChange={(channelId) => persist({ ...settings, panelChannelId: channelId })} placeholder="No panel (commands only)" />
            {settings.panelChannelId && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Title</label>
                  <input
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                    value={settings.panelTitle}
                    maxLength={256}
                    onChange={(e) => setSettings({ ...settings, panelTitle: e.target.value })}
                    onBlur={() => persist(settings)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Message</label>
                  <textarea
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-28"
                    value={settings.panelText}
                    maxLength={4000}
                    onChange={(e) => setSettings({ ...settings, panelText: e.target.value })}
                    onBlur={() => persist(settings)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs uppercase tracking-wide text-slate-500">Color</label>
                  <input type="color" value={settings.panelColor} onChange={(e) => setSettings({ ...settings, panelColor: e.target.value })} onBlur={() => persist(settings)} className="h-8 w-12 bg-transparent" aria-label="Embed color" />
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-white ml-auto"
                    onClick={() => persist({ ...settings, panelTitle: PROFILE_PANEL_DEFAULTS.panelTitle, panelText: PROFILE_PANEL_DEFAULTS.panelText, panelColor: PROFILE_PANEL_DEFAULTS.panelColor })}
                  >
                    Reset wording
                  </button>
                  <button type="button" className="neon-button-sm" onClick={() => persist(settings, true)}>
                    Repost panel
                  </button>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Cards from the panel</label>
                  <div className="space-y-1.5 text-sm text-slate-300">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="panelPublic" checked={!settings.panelPublic} onChange={() => persist({ ...settings, panelPublic: false })} />
                      Only the person who pressed the button sees it (keeps the channel clean)
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="panelPublic" checked={settings.panelPublic} onChange={() => persist({ ...settings, panelPublic: true })} />
                      Post it in the channel for everyone
                    </label>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Changing the channel, title, message or color replaces the posted panel. Turn on the Profile Cards module for it to post.</p>
                {panelError && <p className="text-xs text-rose-400">{panelError}</p>}
              </div>
            )}
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
