"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { DiscordMessage } from "../../../../components/ui/DiscordPreview";
import { api, type BumpReminderSettingsRow } from "../../../../lib/api";

const BUMP = "</bump:947088344167366698>";
const MISSED_AFTER = [5, 10, 15, 30, 60, 90];
const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";

const ago = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export default function BumpReminderPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<BumpReminderSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);
  const [bumper, setBumper] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api.getBumpReminderSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const id = settings?.lastBumpedById;
    if (!id) return setBumper(null);
    api
      .getDiscordMembers(params.guildId, [id])
      .then(([m]) => setBumper(m ? m.nickname || m.username : null))
      .catch(() => setBumper(null));
  }, [params.guildId, settings?.lastBumpedById]);

  async function update(patch: Partial<BumpReminderSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateBumpReminderSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const ready = settings?.nextReminderAt ? new Date(settings.nextReminderAt).getTime() : null;
  const missedOn = settings?.missedAlertEnabled ?? true;
  const missedAfter = settings?.missedAfterMin ?? 30;
  const role = settings?.mentionRoleId ? `<@&${settings.mentionRoleId}> ` : "";

  // Where things stand right now.
  let status: { text: string; tone: string } = { text: "Waiting for the first bump. Run /bump on Disboard to start.", tone: "text-slate-400" };
  if (ready && now < ready) status = { text: `Bumped. The next bump is ready in ${ago(ready - now)}.`, tone: "text-emerald-400" };
  else if (ready && missedOn && now >= ready + missedAfter * 60_000) status = { text: `Bump missed. It's been ready for ${ago(now - ready)}.`, tone: "text-rose-400" };
  else if (ready) status = { text: `Ready to bump now (for ${ago(now - ready)}).`, tone: "text-amber-300" };

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="BUMP_REMINDER"
        title="Bump Reminder"
        description="Watches for Disboard's 'Bump done!' confirmation, reminds the channel once the 2-hour cooldown is up, and alerts if a bump is missed."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <NeonCard>
            <p className="font-medium mb-2">Status</p>
            <p className={`text-sm ${status.tone}`}>{status.text}</p>
            {settings?.lastBumpAt && (
              <p className="text-xs text-slate-500 mt-2">
                Last bump: {new Date(settings.lastBumpAt).toLocaleString()}
                {bumper ? ` by ${bumper}` : ""}
              </p>
            )}
            {ready && <p className="text-xs text-slate-500 mt-1">Next bump ready: {new Date(ready).toLocaleString()}</p>}
            {!!settings?.missedAlerts && <p className="text-xs text-rose-400/80 mt-1">Missed-bump alerts sent since the last bump: {settings.missedAlerts}</p>}
          </NeonCard>

          <NeonCard>
            <label className={label}>Reminder Channel</label>
            <ChannelSelect
              guildId={params.guildId}
              value={settings?.channelId ?? null}
              onChange={(id) => update({ channelId: id || null })}
              kind="text"
              placeholder="Off — not reminding anywhere"
            />

            <label className={`${label} mt-4`}>Mention Role (optional)</label>
            <RoleSelect
              guildId={params.guildId}
              value={settings?.mentionRoleId ?? null}
              onChange={(id) => update({ mentionRoleId: id || null })}
              placeholder="No role pinged"
            />

            <div className="mt-5 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Missed Bump Alert</p>
                  <p className="text-xs text-slate-500">Posts in the same channel when nobody bumps in time, then again for every 2 hours missed after that.</p>
                </div>
                <ToggleSwitch enabled={missedOn} onChange={(v) => update({ missedAlertEnabled: v })} label="Missed bump alert" />
              </div>
              {missedOn && (
                <div className="mt-3">
                  <label className={label}>Alert When Nobody Bumps Within</label>
                  <select className={field} value={missedAfter} onChange={(e) => update({ missedAfterMin: Number(e.target.value) })}>
                    {MISSED_AFTER.map((m) => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : "1 hour 30 minutes"} after it's ready
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {saved && <p className="text-xs text-emerald-400 mt-3">Saved ✓</p>}
          </NeonCard>

          <NeonCard>
            <p className="text-sm font-medium mb-1">Why Spartacus can't bump by itself</p>
            <p className="text-xs text-slate-400">
              Discord doesn't let bots run other bots' commands, so only a person can run Disboard's /bump. Automating a member's account to do it breaks
              Discord's and Disboard's rules and can get the server removed from Disboard. The reminder and alert make the /bump clickable, so bumping is one tap.
            </p>
          </NeonCard>
        </div>

        <NeonCard>
          <p className="font-medium mb-3">Preview</p>
          <div className="space-y-3">
            <DiscordMessage content={`${role}⏰ The server can be bumped again! Use ${BUMP} on Disboard.`} time="Today at 2:00 PM" />
            {missedOn && (
              <DiscordMessage
                content={`${role}⚠️ **Bump missed!** The server could be bumped <t:${Math.floor((Date.now() - missedAfter * 60_000) / 1000)}:R> and nobody has yet. Use ${BUMP} now.`}
                time={`Today at ${missedAfter >= 60 ? `${2 + Math.floor(missedAfter / 60)}:${String(missedAfter % 60).padStart(2, "0")}` : `2:${String(missedAfter).padStart(2, "0")}`} PM`}
              />
            )}
          </div>
          <p className="text-xs text-slate-500 mt-3">The bump is ready 2 hours after Disboard says “Bump done!”. Bumping again resets everything.</p>
        </NeonCard>
      </div>
    </div>
  );
}
