"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { Required } from "../../../../components/ui/Required";
import { DateTimeZoneField } from "../../../../components/ui/DateTimeZoneField";
import { FormError } from "../../../../components/ui/FormError";
import { ModuleMessage, designFrom } from "../../../../components/embedCreator/ModuleMessage";
import { api, type GiveawayInput, type GiveawayRow } from "../../../../lib/api";

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

const TOKENS = [
  { token: "{prize}", description: "The prize" },
  { token: "{winners}", description: "How many winners" },
  { token: "{ends}", description: "When it ends (shows as a countdown)" },
];

const newKey = () => `new-${Date.now().toString(36)}`;

export default function GiveawaysPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<GiveawayRow[]>([]);
  const [form, setForm] = useState<GiveawayInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  // Names this giveaway's own embed until it's started.
  const [draftKey, setDraftKey] = useState(newKey);

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
    setDraftKey(newKey());
    refresh();
  }

  const ends = form.endsAt && !Number.isNaN(new Date(form.endsAt).getTime()) ? `<t:${Math.floor(new Date(form.endsAt).getTime() / 1000)}:R>` : "in 2 days";

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="GIVEAWAYS"
        title="Giveaways"
        description="The bot posts an Enter button in the chosen channel and automatically picks a winner when it ends."
      />

      <NeonCard className="mb-6">
        <p className="font-medium mb-3">Create Giveaway</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Channel
              <Required />
            </label>
            <ChannelSelect guildId={params.guildId} value={form.channelId || null} onChange={(id) => setForm((f) => ({ ...f, channelId: id }))} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Prize
              <Required />
            </label>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
              value={form.prize}
              onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Winners</label>
            <input
              type="number"
              min={1}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
              value={form.winnerCount}
              onChange={(e) => setForm((f) => ({ ...f, winnerCount: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Ends At
              <Required />
            </label>
            <DateTimeZoneField value={form.endsAt} onChange={(endsAt) => setForm((f) => ({ ...f, endsAt }))} />
          </div>
        </div>
      </NeonCard>

      <ModuleMessage
        key={draftKey}
        guildId={params.guildId}
        title="Giveaway post"
        description="Posted when the giveaway starts. The Enter button is added under it."
        ownerKey={`giveaway:${draftKey}`}
        savedEmbedId={form.savedEmbedId ?? null}
        onSavedEmbedChange={(id) => setForm((f) => ({ ...f, savedEmbedId: id }))}
        seed={() =>
          designFrom({
            title: "🎁 {prize}",
            description: "Click **Enter** below to join. Ends {ends}.",
            color: "#B14BFF",
            footer: "{winners} winner(s)",
          })
        }
        tokens={TOKENS}
        tokenValues={{ "{prize}": form.prize || "Prize name", "{winners}": String(form.winnerCount || 1), "{ends}": ends }}
        moduleButtons={["🎉 Enter"]}
      >
        <button onClick={create} disabled={!form.channelId || !form.prize || !form.endsAt} className="neon-button disabled:opacity-50">
          Start Giveaway
        </button>
        <FormError message={error} />
      </ModuleMessage>

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
  );
}
