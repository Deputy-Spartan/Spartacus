"use client";

import { useEffect, useState } from "react";
import { AI_CHAT_LIMIT_CHOICES, AI_CHAT_WINDOW_CHOICES, SLOWMODE_CHOICES, formatSeconds } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type AiConfigRow } from "../../../../lib/api";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const select = "bg-base-950 border border-white/10 rounded-lg px-2.5 py-2 text-sm";

function windowWord(s: number) {
  return s === 60 ? "minute" : s === 3600 ? "hour" : formatSeconds(s);
}

export default function AiChatPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<AiConfigRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [slowError, setSlowError] = useState<string | null>(null);

  useEffect(() => {
    api.getAiConfig(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function persist(next: AiConfigRow) {
    setConfig(next);
    setSaving(true);
    try {
      const saved = await api.setAiConfig(params.guildId, next);
      setSlowError(saved.slowmodeError ?? null);
      // The server may have turned slowmode back off (no channel, or no permission).
      setConfig((c) => (c ? { ...c, chatSlowmode: saved.chatSlowmode } : c));
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  const limitText =
    config.chatLimit === 0
      ? "Members can ask as many questions as they like."
      : `Each member can ask ${config.chatLimit} question${config.chatLimit === 1 ? "" : "s"} per ${windowWord(config.chatLimitWindow)}.`;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="AI_CHAT"
        title="AI Chat"
        description="Pick a channel and the bot answers every message there with Claude Haiku 5.5, or mention it anywhere if no channel is picked. It remembers the last few messages in the channel for 15 minutes, so follow-up questions work. Set how often members can ask, and a slowmode for the AI channel, below. Needs ANTHROPIC_API_KEY set in Render."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <div className="flex items-center justify-between mb-4">
            <p className="font-medium">Settings</p>
            {saving && <span className="text-xs text-slate-600">Saving…</span>}
          </div>

          <label className={label}>AI Channel (optional)</label>
          <ChannelSelect
            guildId={params.guildId}
            value={config.chatChannelId}
            onChange={(channelId) => persist({ ...config, chatChannelId: channelId })}
            placeholder="Respond anywhere it's @-mentioned"
          />
          <p className="text-xs text-slate-500 mt-2 mb-3">
            {config.chatChannelId
              ? config.chatRequireMention
                ? "Spartacus only answers in this channel, and only when it's @mentioned."
                : "Spartacus answers every message in this channel, no @mention needed. It stays quiet everywhere else."
              : "No channel picked, so Spartacus answers anywhere it's @mentioned."}
          </p>
          <label className={`flex items-center gap-2 text-sm mb-4 ${config.chatChannelId ? "text-slate-300" : "text-slate-600"}`}>
            <input
              type="checkbox"
              checked={config.chatRequireMention}
              disabled={!config.chatChannelId}
              onChange={(e) => persist({ ...config, chatRequireMention: e.target.checked })}
            />
            Only answer when @mentioned
          </label>

          <label className={label}>Personality / System Prompt</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-24"
            value={config.chatSystemPrompt ?? ""}
            onChange={(e) => setConfig({ ...config, chatSystemPrompt: e.target.value })}
            onBlur={() => persist(config)}
            placeholder="e.g. You are a sarcastic pirate who helps with Discord questions."
          />
          <p className="text-xs text-slate-600 mt-2">Leave blank for the default helpful-assistant personality.</p>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-1">Limits &amp; Slow Mode</p>
          <p className="text-xs text-slate-500 mb-4">Two separate controls: the question limit only counts messages Spartacus answers; slowmode is Discord's own and covers every message in the AI channel.</p>

          <label className={label}>Question limit</label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <select
              className={select}
              value={config.chatLimit}
              onChange={(e) => persist({ ...config, chatLimit: Number(e.target.value) })}
              aria-label="Questions per member"
            >
              {AI_CHAT_LIMIT_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "No limit" : `${n} question${n === 1 ? "" : "s"}`}
                </option>
              ))}
            </select>
            {config.chatLimit > 0 && (
              <>
                <span>per</span>
                <select
                  className={select}
                  value={config.chatLimitWindow}
                  onChange={(e) => persist({ ...config, chatLimitWindow: Number(e.target.value) })}
                  aria-label="Time window"
                >
                  {AI_CHAT_WINDOW_CHOICES.map((s) => (
                    <option key={s} value={s}>
                      {windowWord(s)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {limitText}{" "}
            {config.chatLimit > 0 &&
              "It's a rolling window: each question counts until that much time has passed since it was asked. A skipped question gets a ⏳ reaction and a short note saying when to ask again."}
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-300 mt-3">
            <input type="checkbox" checked={config.chatStaffExempt} onChange={(e) => persist({ ...config, chatStaffExempt: e.target.checked })} />
            Staff with Manage Server skip the limit
          </label>

          <div className="border-t border-white/5 my-4" />

          <label className={label}>Slowmode in the AI channel</label>
          <select
            className={select}
            value={config.chatSlowmode}
            disabled={!config.chatChannelId}
            onChange={(e) => persist({ ...config, chatSlowmode: Number(e.target.value) })}
            aria-label="Slowmode"
          >
            {SLOWMODE_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "Off" : formatSeconds(s)}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            {config.chatChannelId
              ? "Members wait this long between any two messages in the AI channel. Spartacus sets it in Discord when you save, and takes it off the old channel if you pick a different one. Discord lets members with Manage Channels or Manage Messages skip slowmode."
              : "Pick an AI channel first. Slowmode goes on that channel."}
          </p>
          {slowError && <p className="text-xs text-rose-400 mt-2">{slowError}</p>}
        </NeonCard>
      </div>
    </div>
  );
}
