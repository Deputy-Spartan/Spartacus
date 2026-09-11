"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ButtonsEditor } from "../../../../components/ui/ButtonsEditor";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { EmbedExtraAuthor, EmbedExtraThumbnail, EmbedExtraImage, EmbedExtraFieldsPreview, EmbedExtraFooter } from "../../../../components/ui/EmbedExtraPreview";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useBotAvatar } from "../../../../lib/useBotAvatar";
import { api, type GiveawayInput, type GiveawayRow, type StickyButton } from "../../../../lib/api";

const EMPTY: GiveawayInput = {
  channelId: "",
  prize: "",
  description: "",
  embedColor: "#B14BFF",
  imageUrl: "",
  buttons: [],
  winnerCount: 1,
  endsAt: "",
  embedExtra: {},
  savedEmbedId: null,
};

export default function GiveawaysPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<GiveawayRow[]>([]);
  const [form, setForm] = useState<GiveawayInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const avatarUrl = useBotAvatar();

  function refresh() {
    api.getGiveaways(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function create() {
    if (!form.channelId || !form.prize || !form.endsAt) {
      setError("Select a channel, enter a prize, and set an end time before starting.");
      return;
    }
    setError(null);
    await api.addGiveaway(params.guildId, form);
    setForm(EMPTY);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="GIVEAWAYS"
        title="Giveaways"
        description="The bot posts an Enter button in the chosen channel and automatically picks a winner when it ends."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <p className="font-medium mb-3">Create Giveaway</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Channel
            <Required />
          </label>
          <ChannelSelect guildId={params.guildId} value={form.channelId || null} onChange={(id) => setForm({ ...form, channelId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Prize
            <Required />
          </label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={form.prize}
            onChange={(e) => setForm({ ...form, prize: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Announcement Message (optional)</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Extra text shown above the entry instructions."
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Image URL (optional)</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://…"
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
          <div className="flex items-center gap-2 mb-4">
            <input
              type="color"
              className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
              value={form.embedColor}
              onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
            />
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
              value={form.embedColor}
              onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
            />
          </div>

          <EmbedExtraFields value={form.embedExtra ?? {}} onChange={(v) => setForm({ ...form, embedExtra: v })} />

          <SavedEmbedPicker guildId={params.guildId} value={form.savedEmbedId ?? null} onChange={(id) => setForm({ ...form, savedEmbedId: id })} />

          <div className="mb-4">
            <ButtonsEditor guildId={params.guildId} buttons={form.buttons ?? []} onChange={(next: StickyButton[]) => setForm({ ...form, buttons: next })} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Winners</label>
              <input
                type="number"
                min={1}
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={form.winnerCount}
                onChange={(e) => setForm({ ...form, winnerCount: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                Ends At
                <Required />
              </label>
              <input
                type="datetime-local"
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>

          <button onClick={create} disabled={!form.channelId || !form.prize || !form.endsAt} className="neon-button disabled:opacity-50">
            Start Giveaway
          </button>
          <FormError message={error} />
        </NeonCard>

        <div className="space-y-4">
          <NeonCard>
            <p className="font-medium mb-3">Preview</p>
            <div className="rounded-lg bg-[#313338] p-4 font-sans">
              <div className="flex gap-3">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[#f2f3f5] font-medium text-sm">Spartacus</span>
                    <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">BOT</span>
                  </div>
                  <div className="rounded bg-[#2b2d31] border-l-4 p-3 max-w-md" style={{ borderColor: form.embedColor || "#B14BFF" }}>
                    <EmbedExtraThumbnail embedExtra={form.embedExtra} />
                    <EmbedExtraAuthor embedExtra={form.embedExtra} />
                    <p className="text-[#f2f3f5] font-semibold text-sm mb-1">🎁 {form.prize || "Prize name"}</p>
                    <p className="text-[#dbdee1] text-sm whitespace-pre-wrap mb-2">
                      {form.description ? `${form.description}\n\n` : ""}
                      Click <span className="font-semibold">Enter</span> below to join. Ends {form.endsAt ? new Date(form.endsAt).toLocaleString() : "…"}.
                    </p>
                    <EmbedExtraFieldsPreview embedExtra={form.embedExtra} />
                    {form.imageUrl && <img src={form.imageUrl} alt="" className="rounded max-h-40 object-cover mb-2" />}
                    <EmbedExtraImage embedExtra={form.embedExtra} />
                    <p className="text-[#949ba4] text-xs">{form.winnerCount} winner(s)</p>
                    <EmbedExtraFooter embedExtra={form.embedExtra} />
                  </div>
                  <div className="mt-2">
                    <span className="inline-block bg-[#248046] text-white text-xs font-medium px-3 py-1.5 rounded">Enter</span>
                  </div>
                </div>
              </div>
            </div>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-3">Active &amp; Past Giveaways</p>
            {rows.length === 0 && <p className="text-sm text-slate-500">No giveaways yet.</p>}
            <div className="divide-y divide-white/5">
              {rows.map((g) => (
                <div key={g.id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{g.prize}</span>
                    <span className="text-xs text-slate-500">{g.ended ? "Ended" : "Active"}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {g.entries.length} entries · {g.winnerCount} winner(s) · ends {new Date(g.endsAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </NeonCard>
        </div>
      </div>
    </div>
  );
}
