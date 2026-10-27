"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type ModDigestSettingsRow, type DiscordRoleOption } from "../../../../lib/api";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hourLabel(h: number) {
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period} UTC`;
}

function StaffRolesPicker({ guildId, value, onChange }: { guildId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);
  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
  }, [guildId]);
  const available = roles.filter((r) => !value.includes(r.id));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((id) => {
          const role = roles.find((r) => r.id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300">
              @{role?.name ?? id}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="text-slate-500 hover:text-neon-blue">
                ×
              </button>
            </span>
          );
        })}
        {value.length === 0 && <span className="text-xs text-slate-500">None selected — every moderator is included.</span>}
      </div>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">Add a staff role…</option>
        {available.map((r) => (
          <option key={r.id} value={r.id}>
            @{r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ModDigestPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<ModDigestSettingsRow | null>(null);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState("");

  useEffect(() => {
    api.getModDigestSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function patch(partial: Partial<ModDigestSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    const updated = await api.updateModDigestSettings(params.guildId, partial);
    setSettings(updated);
  }

  async function sendNow() {
    setSending(true);
    setSentNote("");
    try {
      await api.sendModDigestNow(params.guildId);
      setSentNote("Sent — the bot posts it within a minute.");
    } catch (e) {
      setSentNote(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  if (!settings) return null;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="MOD_DIGEST"
        title="Mod Accountability Digest"
        description="Posts a summary of recent moderation actions — warns, mutes, kicks, and bans — broken down by moderator, on the schedule below."
      />

      <NeonCard className="mb-4">
        <p className="font-medium mb-1">Digest Channel</p>
        <p className="text-xs text-slate-500 mb-3">The digest embed is posted here.</p>
        <ChannelSelect
          guildId={params.guildId}
          value={settings.channelId}
          onChange={(v) => patch({ channelId: v || null })}
          kind="text"
          placeholder="Off — not posting anywhere"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <div>
            <p className="text-xs text-slate-500 mb-1">How often</p>
            <select
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={settings.frequency}
              onChange={(e) => patch({ frequency: e.target.value as "DAILY" | "WEEKLY" })}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </div>

          {settings.frequency === "WEEKLY" && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Day</p>
              <select
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={settings.dayOfWeek}
                onChange={(e) => patch({ dayOfWeek: Number(e.target.value) })}
              >
                {DAY_LABELS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="text-xs text-slate-500 mb-1">Time</p>
            <select
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={settings.hourUtc}
              onChange={(e) => patch({ hourUtc: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={sendNow}
            disabled={sending || !settings.channelId}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-base-900 border border-white/10 hover:border-neon-blue transition-colors disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Now"}
          </button>
          {sentNote && <span className="text-xs text-slate-500">{sentNote}</span>}
          {!sentNote && settings.lastSentAt && (
            <span className="text-xs text-slate-500">Last sent {new Date(settings.lastSentAt).toLocaleString()}</span>
          )}
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-1">Staff Roles</p>
        <p className="text-xs text-slate-500 mb-3">
          Limit the digest to moderators holding these roles (top 10 by activity are shown). A moderator with more than one of these
          roles gets a separate line per role. Leave empty to include every moderator who logged an action.
        </p>
        <StaffRolesPicker guildId={params.guildId} value={settings.staffRoleIds} onChange={(ids) => patch({ staffRoleIds: ids })} />
      </NeonCard>
    </div>
  );
}
