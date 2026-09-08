"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, type AutomodConfig } from "../../../../lib/api";

export default function ModerationPage({ params }: { params: { guildId: string } }) {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<AutomodConfig>({ bannedWords: [], antiLink: false, spamCap: true });
  const [bannedWordsInput, setBannedWordsInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getModeration(params.guildId).then(({ enabled, config }) => {
      setEnabled(enabled);
      setConfig(config);
      setBannedWordsInput(config.bannedWords.join(", "));
    });
  }, [params.guildId]);

  async function toggleModule(next: boolean) {
    setEnabled(next);
    await api.setModule(params.guildId, "MODERATION", next);
  }

  async function save() {
    setSaving(true);
    const next: AutomodConfig = {
      ...config,
      bannedWords: bannedWordsInput
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    };
    await api.setModeration(params.guildId, next);
    setConfig(next);
    setSaving(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Moderation & Automod</h1>
          <p className="text-slate-400 mt-1">Automatic message filtering plus /kick /ban /mute /warn.</p>
        </div>
        <ToggleSwitch enabled={enabled} onChange={toggleModule} label="Moderation module" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Banned Words</p>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-3 text-sm min-h-24 focus:outline-none focus:ring-1 focus:ring-neon-blue"
            placeholder="comma, separated, words"
            value={bannedWordsInput}
            onChange={(e) => setBannedWordsInput(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-2">Messages containing any of these are removed automatically.</p>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-4">Automod Rules</p>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm">Anti-Link</p>
              <p className="text-xs text-slate-500">Remove messages containing URLs.</p>
            </div>
            <ToggleSwitch
              enabled={config.antiLink}
              onChange={(next) => setConfig((c) => ({ ...c, antiLink: next }))}
              label="Anti-link"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Spam Capping</p>
              <p className="text-xs text-slate-500">Remove messages when a user posts too fast.</p>
            </div>
            <ToggleSwitch
              enabled={config.spamCap}
              onChange={(next) => setConfig((c) => ({ ...c, spamCap: next }))}
              label="Spam cap"
            />
          </div>
        </NeonCard>
      </div>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
