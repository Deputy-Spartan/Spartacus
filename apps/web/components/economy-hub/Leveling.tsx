"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { ChannelOverrideField } from "../ui/ChannelOverrideField";
import { ModuleHeader } from "../ui/ModuleHeader";
import { SaveStatus } from "../ui/SaveStatus";
import { ModuleMessage, designFrom } from "../embedCreator/ModuleMessage";
import { api, type LeaderboardRow, type LevelingSettingsRow } from "../../lib/api";
import { downloadCsv } from "../../lib/csv";
import { useAutoSave } from "../../lib/useAutoSave";

const LEVEL_UP_TOKENS = [
  { token: "{user}", description: "Mentions the member who leveled up" },
  { token: "{level}", description: "The level they just reached" },
  { token: "{rewards}", description: "What they got: coins, crates, the new level role" },
  { token: "{next}", description: "The next rank and the XP it needs" },
  { token: "{rank}", description: "The name of their rank on the ladder" },
  { token: "{avatar}", description: "Their profile picture, for an image link" },
  { token: "{card}", description: "The level-up card picture (put it in the Image link; needs the card turned on)" },
];

function LevelUpSettings({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<LevelingSettingsRow | null>(null);

  useEffect(() => {
    api.getLevelingSettings(guildId).then(setSettings);
  }, [guildId]);

  const autoSave = useAutoSave(settings, async () => {
    if (settings) setSettings(await api.setLevelingSettings(guildId, settings));
  });

  if (!settings) return null;

  return (
    <div className="mb-5">
      <NeonCard className="max-w-lg mb-5">
        <p className="font-medium mb-1">Level-Up Announcements</p>
        <ChannelOverrideField
          guildId={guildId}
          value={settings.channelId}
          onChange={(id) => setSettings((s) => (s ? { ...s, channelId: id } : s))}
          label="Post to a specific channel"
          fallbackNote="Off — level-ups post in whatever channel the message that triggered them was sent in."
        />
        <SaveStatus status={autoSave} />
      </NeonCard>
      <ModuleMessage
        guildId={guildId}
        title="Level-up post"
        description="Posted when someone levels up."
        ownerKey="leveling:levelUp"
        savedEmbedId={settings.savedEmbedId ?? null}
        onSavedEmbedChange={(id) => setSettings((s) => (s ? { ...s, savedEmbedId: id } : s))}
        seed={() =>
          designFrom({
            content: "{user}",
            description: `${settings.levelUpMessage || "🎉 {user} just reached **Level {level}**!"}\n\n**Rewards**\n{rewards}\n\n-# {next}`,
            color: "#5865F2",
            imageUrl: "{card}",
          })
        }
        tokens={LEVEL_UP_TOKENS}
        tokenValues={{
          "{user}": "<@0>",
          "{level}": "10",
          "{rewards}": "• 🪙 250 coins\n• 🎖️ <@&0>",
          "{next}": "Next: Veteran at level 15 (1,500 XP)",
          "{rank}": "Soldier",
          "{avatar}": "https://cdn.discordapp.com/embed/avatars/0.png",
          "{card}": "",
        }}
      />
    </div>
  );
}

export default function LevelingPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    api.getLeaderboard(params.guildId).then(setRows);
  }, [params.guildId]);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="LEVELING"
        title="Leveling & XP"
        description="Top members by message-based XP this server has ever awarded."
      />

      <LevelUpSettings guildId={params.guildId} />

      {rows && rows.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() =>
              downloadCsv(
                `leveling-leaderboard-${params.guildId}.csv`,
                rows.map((row) => ({
                  userId: row.userId,
                  username: row.username ?? "",
                  nickname: row.nickname ?? "",
                  xp: row.xp,
                  level: row.level,
                }))
              )
            }
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-base-900 border border-white/10 hover:border-neon-blue transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}

      <NeonCard>
        {!rows && <p className="text-slate-500 text-sm">Loading…</p>}
        {rows?.length === 0 && <p className="text-slate-500 text-sm">No XP data yet — activity will appear here.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((row, i) => (
            <div key={row.userId} className="flex items-center gap-4 py-3">
              <span className="w-6 text-slate-500 font-semibold text-sm">#{i + 1}</span>
              <div className="w-9 h-9 rounded-full bg-base-800 border border-white/10 flex items-center justify-center text-xs text-slate-400">
                {(row.username ?? row.userId).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {row.username ?? `User ${row.userId}`}
                  {row.nickname && row.nickname !== row.username && (
                    <span className="text-slate-500 font-normal"> ({row.nickname})</span>
                  )}
                </p>
                <div className="h-1.5 bg-base-800 rounded-full mt-1.5 overflow-hidden max-w-xs">
                  <div
                    className="h-full bg-neon-gradient rounded-full"
                    style={{ width: `${Math.min(100, (row.xp % 1000) / 10)}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-neon-blue">LVL {row.level}</p>
                <p className="text-xs text-slate-500">{row.xp.toLocaleString()} XP</p>
              </div>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
