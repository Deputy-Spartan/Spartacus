"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HONEYPOT_ACTIONS,
  HONEYPOT_ACTION_INFO,
  HONEYPOT_COUNTER_SCOPES,
  HONEYPOT_SCOPE_LABELS,
  HONEYPOT_TOKENS,
  defaultHoneypotMessage,
  honeypotCounterLabel,
  honeypotTokenValues,
} from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { FormError } from "../../../../components/ui/FormError";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { MessageDesigner, TokenChips, toCreatorState, withTokens, type DesignedMessage } from "../../../../components/embedCreator/MessageDesigner";
import { EmbedCreatorPreview } from "../../../../components/embedCreator/EmbedCreatorPreview";
import { DiscordLimitsCard } from "../../../../components/embedCreator/DiscordLimitsCard";
import { checkDiscordLimits } from "../../../../lib/discordLimits";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { useMemberNames } from "../../../../lib/useMemberNames";
import { api, type EmbedCreatorPresetRow, type HoneypotConfig, type HoneypotStatsRow } from "../../../../lib/api";

type Tab = "settings" | "message" | "stats";

const labelClass = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const inputClass = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-950/60 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{value.toLocaleString()}</p>
      {hint && <p className="text-[11px] text-slate-600 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function HoneypotPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("settings");
  const [config, setConfig] = useState<HoneypotConfig | null>(null);
  const [message, setMessage] = useState<DesignedMessage | null>(null);
  const [stats, setStats] = useState<HoneypotStatsRow | null>(null);
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);
  const [messageError, setMessageError] = useState<string | null>(null);
  const { displayName } = useMemberNames(guildId, stats?.recent.map((r) => r.userId) ?? []);

  useEffect(() => {
    api.getHoneypot(guildId).then((c) => {
      setConfig(c);
      setMessage(c.creatorData ?? (defaultHoneypotMessage() as unknown as DesignedMessage));
    });
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId]);

  // The numbers keep counting while the page is open.
  useEffect(() => {
    const load = () => api.getHoneypotStats(guildId).then(setStats).catch(() => null);
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [guildId]);

  // messageId is the server's to set, so it stays out of what autosave watches.
  const saveValue = useMemo(() => {
    if (!config || !message) return null;
    const { messageId: _messageId, messageError: _messageError, ...rest } = config;
    return { ...rest, creatorData: message };
  }, [config, message]);
  async function save() {
    if (!saveValue) return;
    const saved = await api.setHoneypot(guildId, saveValue);
    setMessageError(saved.messageError ?? null);
    setConfig((c) => (c ? { ...c, messageId: saved.messageId } : c));
  }
  const status = useAutoSave(saveValue, save);

  if (!config || !message) return <p className="text-slate-400">Loading…</p>;

  const patch = (next: Partial<HoneypotConfig>) => setConfig({ ...config, ...next });
  const info = HONEYPOT_ACTION_INFO[config.action];
  const numbers = stats ?? { server: 0, week: 0, global: 0, servers: 0 };

  async function resetMessage() {
    if (!(await confirm("Replace this message with the default honeypot design? Your current text, embeds and buttons will be lost.", { confirmLabel: "Use Default" }))) return;
    setMessage(defaultHoneypotMessage() as unknown as DesignedMessage);
    patch({ savedEmbedId: null });
  }

  const savedPreset = config.savedEmbedId ? presets.find((p) => p.id === config.savedEmbedId) ?? null : null;
  const state = savedPreset ? { ...toCreatorState(message), ...savedPreset.data } : toCreatorState(message);
  const limits = checkDiscordLimits(state);
  const tabClass = (t: Tab) =>
    ["px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0", tab === t ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300"].join(" ");

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="HONEYPOT"
        title="Honeypot"
        description="A trap channel real members are told to leave alone. Spam bots and hacked accounts post everywhere, so anyone who posts in it is removed automatically."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5 overflow-x-auto">
        <button onClick={() => setTab("settings")} className={tabClass("settings")}>
          Settings
        </button>
        <button onClick={() => setTab("message")} className={tabClass("message")}>
          Channel Message
        </button>
        <button onClick={() => setTab("stats")} className={tabClass("stats")}>
          Stats{stats ? ` (${stats.server.toLocaleString()})` : ""}
        </button>
      </div>

      {tab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <NeonCard>
            <label className={labelClass}>Honeypot Channel</label>
            <ChannelSelect guildId={guildId} value={config.channelId} onChange={(channelId) => patch({ channelId: channelId || null })} />
            <p className="text-xs text-slate-600 -mt-2 mb-4">
              Use a channel made only for this, and never a normal one. Members with Manage Messages are never caught, so staff can post in it to test.
            </p>

            <div className="flex items-center justify-between py-2.5 border-t border-white/5">
              <div>
                <p className="text-sm font-medium">Delete what they posted</p>
                <p className="text-xs text-slate-500">Removes the message that set off the trap.</p>
              </div>
              <ToggleSwitch enabled={config.deleteMessage} onChange={(v) => patch({ deleteMessage: v })} label="Delete what they posted" />
            </div>
            <div className="flex items-center mt-3">
              <button type="button" onClick={() => save()} className="neon-button">
                Save
              </button>
              <SaveStatus status={status} />
            </div>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-1">What happens to them</p>
            <p className="text-xs text-slate-500 mb-3">Applies to anyone who posts in the honeypot channel.</p>
            <div className="space-y-2">
              {HONEYPOT_ACTIONS.map((action) => {
                const on = config.action === action;
                return (
                  <button
                    key={action}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ action })}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${on ? "border-neon-blue/60 bg-neon-blue/10" : "border-white/10 hover:border-white/20"}`}
                  >
                    <p className={`text-sm font-medium ${on ? "text-neon-blue" : ""}`}>{HONEYPOT_ACTION_INFO[action].label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{HONEYPOT_ACTION_INFO[action].description}</p>
                  </button>
                );
              })}
            </div>
            {config.action === "TIMEOUT" && (
              <div className="mt-4">
                <label className={labelClass}>Timeout Length (minutes)</label>
                <input type="number" min={1} max={40320} className={inputClass} value={config.timeoutMinutes} onChange={(e) => patch({ timeoutMinutes: Number(e.target.value) || 1 })} />
                <p className="text-xs text-slate-600 mt-1.5">1440 is one day. Discord's longest timeout is 28 days (40320).</p>
              </div>
            )}
            <p className="text-xs text-slate-600 mt-3">
              Spartacus needs the {config.action === "KICK" ? "Kick Members" : config.action === "TIMEOUT" ? "Timeout Members" : "Ban Members"} permission, and its role must sit above the member's roles.
            </p>
          </NeonCard>
        </div>
      )}

      {tab === "message" && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,1fr)] gap-5 items-start">
          <div className="min-w-0">
            <NeonCard className="mb-4">
              <div className="flex items-center justify-between gap-4 pb-3 mb-3 border-b border-white/5">
                <div>
                  <p className="font-medium">Post a message in the honeypot channel</p>
                  <p className="text-xs text-slate-500">Warns real members not to type there. It posts when you save and edits itself in place after that.</p>
                </div>
                <ToggleSwitch enabled={config.messageEnabled} onChange={(v) => patch({ messageEnabled: v })} label="Post a message in the honeypot channel" />
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">Show a counter</p>
                  <p className="text-xs text-slate-500">A greyed-out button under the message that counts up by itself.</p>
                </div>
                <ToggleSwitch enabled={config.showCounter} onChange={(v) => patch({ showCounter: v })} label="Show a counter" />
              </div>
              {config.showCounter && (
                <div className="mb-2">
                  <label className={labelClass}>What the counter counts</label>
                  <select className={inputClass} value={config.counterScope} onChange={(e) => patch({ counterScope: e.target.value as HoneypotConfig["counterScope"] })}>
                    {HONEYPOT_COUNTER_SCOPES.map((scope) => (
                      <option key={scope} value={scope}>
                        {HONEYPOT_SCOPE_LABELS[scope]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-600 mt-1.5">
                    Reads <span className="text-slate-400">{honeypotCounterLabel(config.action, config.counterScope, numbers)}</span> right now. The word follows the action picked on the Settings tab.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between py-2.5 border-t border-white/5">
                <div>
                  <p className="text-sm font-medium">Show a Honeypot Stats button</p>
                  <p className="text-xs text-slate-500">Privately shows whoever clicks it this server's numbers and the totals across every server.</p>
                </div>
                <ToggleSwitch enabled={config.showStatsButton} onChange={(v) => patch({ showStatsButton: v })} label="Show a Honeypot Stats button" />
              </div>
              {!config.channelId && <p className="text-xs text-amber-300 mt-2">Pick a honeypot channel on the Settings tab first.</p>}
              <FormError message={messageError} />
            </NeonCard>

            <TokenChips tokens={HONEYPOT_TOKENS} note="The numbers update on the posted message by themselves." />

            <MessageDesigner
              guildId={guildId}
              value={message}
              onChange={setMessage}
              savedEmbedId={config.savedEmbedId}
              onSavedEmbedChange={(id) => patch({ savedEmbedId: id })}
              onReset={resetMessage}
              savedEmbedNote="The counter and stats buttons are still added under it."
            >
              <div className="flex items-center mt-4">
                <button type="button" onClick={() => save()} className="neon-button">
                  Save
                </button>
                <SaveStatus status={status} />
              </div>
            </MessageDesigner>
          </div>

          <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            <NeonCard>
              <p className="font-medium mb-3">Live Preview</p>
              <EmbedCreatorPreview guildId={guildId} state={withTokens(state, honeypotTokenValues(config.action, numbers, "Your Server"))} />
              {(config.showCounter || config.showStatsButton) && (
                <div className="flex flex-wrap gap-2 mt-2 rounded-lg bg-[#313338] px-4 py-3">
                  {config.showCounter && <span className="rounded bg-[#4e5058]/60 text-[#dbdee1]/70 text-sm px-3 py-1.5">{honeypotCounterLabel(config.action, config.counterScope, numbers)}</span>}
                  {config.showStatsButton && <span className="rounded bg-[#4e5058] text-white text-sm px-3 py-1.5">📊 Honeypot Stats</span>}
                </div>
              )}
              {savedPreset && <p className="text-xs text-slate-500 mt-2">Showing the saved embed "{savedPreset.name}". That's what will post.</p>}
              <p className="text-xs text-slate-600 mt-2">{config.messageEnabled ? (config.messageId ? "This message is live in the channel and updates when you save." : "This posts to the channel when you save.") : "Turn the message on above to post this."}</p>
            </NeonCard>
            <DiscordLimitsCard report={limits} />
          </div>
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-4">
          <NeonCard>
            <p className="font-medium mb-3">This server</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Caught all time" value={numbers.server} />
              <StatTile label="Caught in the last 7 days" value={numbers.week} />
              {HONEYPOT_ACTIONS.filter((a) => stats?.byAction[a]).map((a) => (
                <StatTile key={a} label={HONEYPOT_ACTION_INFO[a].counter} value={stats?.byAction[a] ?? 0} />
              ))}
            </div>
          </NeonCard>
          <NeonCard>
            <p className="font-medium mb-1">Every server</p>
            <p className="text-xs text-slate-500 mb-3">Live totals across all servers running a Spartacus honeypot. Refreshes every 30 seconds.</p>
            <div className="grid grid-cols-2 gap-3 max-w-xl">
              <StatTile label="Servers with a honeypot running" value={numbers.servers} />
              <StatTile label="Caught in total" value={numbers.global} />
            </div>
          </NeonCard>
          <NeonCard>
            <p className="font-medium mb-3">Recently caught here</p>
            {!stats || stats.recent.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody has set off the honeypot yet. It's currently set to {info.label.toLowerCase()} anyone who does.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {stats.recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate">{displayName(r.userId)}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {HONEYPOT_ACTION_INFO[r.action as keyof typeof HONEYPOT_ACTION_INFO]?.past ?? r.action} · {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </NeonCard>
        </div>
      )}
    </div>
  );
}
