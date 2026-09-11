"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { EmbedExtraAuthor, EmbedExtraThumbnail, EmbedExtraImage, EmbedExtraFieldsPreview, EmbedExtraFooter } from "../../../../components/ui/EmbedExtraPreview";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type BirthdayConfigRow, type BirthdayRow } from "../../../../lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];

export default function BirthdaysPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [config, setConfig] = useState<BirthdayConfigRow | null>(null);
  const [birthdays, setBirthdays] = useState<BirthdayRow[]>([]);

  function refresh() {
    api.getBirthdayConfig(params.guildId).then(setConfig);
    api.getBirthdays(params.guildId).then(setBirthdays);
  }
  useEffect(refresh, [params.guildId]);

  async function persist(next: BirthdayConfigRow) {
    setConfig(next);
    await api.setBirthdayConfig(params.guildId, next);
  }

  async function remove(userId: string) {
    if (!(await confirm("Remove this member's saved birthday?"))) return;
    await api.deleteBirthday(params.guildId, userId);
    refresh();
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="BIRTHDAYS"
        title="Birthdays"
        description="Members submit their birthday with /birthday set — the bot posts a designed embed to celebrate it on the day."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <p className="font-medium mb-3">Announcement Setup</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Announcement Channel</label>
          <ChannelSelect guildId={params.guildId} value={config.channelId} onChange={(id) => persist({ ...config, channelId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ping Role (optional)</label>
          <RoleSelect guildId={params.guildId} value={config.pingRoleId} onChange={(id) => persist({ ...config, pingRoleId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={config.embedTitle ?? ""}
            onChange={(e) => persist({ ...config, embedTitle: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-2"
            rows={2}
            value={config.embedMessage ?? ""}
            onChange={(e) => persist({ ...config, embedMessage: e.target.value })}
          />
          <p className="text-xs text-slate-600 mb-4">Use {"{user}"} to mention everyone whose birthday is today.</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
              value={config.embedColor ?? "#FF69B4"}
              onChange={(e) => persist({ ...config, embedColor: e.target.value })}
            />
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
              value={config.embedColor ?? "#FF69B4"}
              onChange={(e) => persist({ ...config, embedColor: e.target.value })}
            />
          </div>

          <EmbedExtraFields
            value={config.embedExtra ?? {}}
            onChange={(v) => persist({ ...config, embedExtra: v })}
          />
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-1">Set-my-birthday button</p>
          <p className="text-xs text-slate-500 mb-4">
            Post a standing "Set My Birthday" button so members can save their date with one click, instead of only /birthday set.
          </p>

          <div className="flex items-center justify-between py-2.5 border-b border-white/5 mb-4">
            <div>
              <p className="text-sm font-medium">Enable button panel</p>
              <p className="text-xs text-slate-500">Clicking it opens a quick month/day form.</p>
            </div>
            <ToggleSwitch enabled={config.useButton} onChange={(v) => persist({ ...config, useButton: v })} label="Enable button panel" />
          </div>

          {config.useButton && (
            <>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Button Channel</label>
              <ChannelSelect guildId={params.guildId} value={config.buttonChannelId} onChange={(id) => persist({ ...config, buttonChannelId: id })} />
              <p className="text-xs text-slate-600 -mt-3">The bot posts the panel here automatically within a minute.</p>
            </>
          )}
        </NeonCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mt-4">
        <NeonCard>
          <div className="rounded-lg bg-[#313338] p-4 font-sans mb-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[#f2f3f5] font-medium text-sm">Spartacus</span>
              <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">BOT</span>
            </div>
            <div className="rounded bg-[#2b2d31] border-l-4 p-3" style={{ borderColor: config.embedColor || "#FF69B4" }}>
              <EmbedExtraThumbnail embedExtra={config.embedExtra} />
              <EmbedExtraAuthor embedExtra={config.embedExtra} />
              <p className="text-[#f2f3f5] font-semibold text-sm mb-1">{config.embedTitle || "🎂 Happy Birthday!"}</p>
              <p className="text-[#dbdee1] text-sm whitespace-pre-wrap">
                {(config.embedMessage || "Everyone wish {user} a happy birthday! 🎉").replace(/{user}/g, "@member")}
              </p>
              <EmbedExtraFieldsPreview embedExtra={config.embedExtra} />
              <EmbedExtraImage embedExtra={config.embedExtra} />
              <EmbedExtraFooter embedExtra={config.embedExtra} />
            </div>
          </div>

          <p className="font-medium mb-3">Saved Birthdays ({birthdays.length})</p>
          {birthdays.length === 0 ? (
            <p className="text-sm text-slate-500">No one has set a birthday yet — members use /birthday set.</p>
          ) : (
            <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
              {birthdays.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {b.userId} — {MONTHS[b.month - 1]} {b.day}
                  </span>
                  <button onClick={() => remove(b.userId)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      </div>
    </div>
  );
}
