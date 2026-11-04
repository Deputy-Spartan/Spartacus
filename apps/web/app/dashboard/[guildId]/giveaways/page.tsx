"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ButtonsEditor } from "../../../../components/ui/ButtonsEditor";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { Required } from "../../../../components/ui/Required";
import { DateTimeZoneField } from "../../../../components/ui/DateTimeZoneField";
import { FormError } from "../../../../components/ui/FormError";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage, extraEmbedProps } from "../../../../components/ui/DiscordPreview";
import { SavedEmbedPreview } from "../../../../components/embedCreator/SavedEmbedPreview";
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

          <SavedEmbedPicker guildId={params.guildId} value={form.savedEmbedId ?? null} onChange={(id) => setForm({ ...form, savedEmbedId: id })} />

          <div className="mb-4">
            <ButtonsEditor guildId={params.guildId} buttons={form.buttons ?? []} onChange={(next: StickyButton[]) => setForm({ ...form, buttons: next })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
              <DateTimeZoneField value={form.endsAt} onChange={(endsAt) => setForm({ ...form, endsAt })} />
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
            {form.savedEmbedId ? (
              <SavedEmbedPreview guildId={params.guildId} savedEmbedId={form.savedEmbedId} />
            ) : (
              <DiscordMessage>
                <DiscordEmbed
                  color={form.embedColor || "#B14BFF"}
                  title={`🎁 ${form.prize || "Prize name"}`}
                  description={`${form.description ? `${form.description}\n\n` : ""}Click **Enter** below to join. Ends ${form.endsAt && !Number.isNaN(new Date(form.endsAt).getTime()) ? `<t:${Math.floor(new Date(form.endsAt).getTime() / 1000)}:R>` : "…"}.`}
                  {...extraEmbedProps(form.embedExtra)}
                  imageUrl={form.imageUrl || form.embedExtra?.imageUrl}
                  footer={form.embedExtra?.footerText || `${form.winnerCount} winner(s)`}
                />
                <DiscordButtonRow>
                  <DiscordButton label="Enter" style="success" />
                  {(form.buttons ?? []).map((btn, i) => (
                    <DiscordButton key={i} label={btn.label || "Button"} style="link" />
                  ))}
                </DiscordButtonRow>
              </DiscordMessage>
            )}
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
