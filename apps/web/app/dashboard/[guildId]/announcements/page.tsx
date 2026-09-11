"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { api, type AnnouncementInput, type AnnouncementRow } from "../../../../lib/api";

const EMPTY: AnnouncementInput = {
  channelId: "",
  content: "",
  embedEnabled: false,
  embedTitle: "",
  embedColor: "#00E5FF",
  buttons: [],
  scheduledFor: null,
  embedExtra: {},
  savedEmbedId: null,
};


export default function AnnouncementsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [form, setForm] = useState<AnnouncementInput>(EMPTY);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getAnnouncements(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function send() {
    if (!form.channelId || (!form.content && !form.savedEmbedId)) {
      setError("Select a channel and enter a message or pick a saved embed before sending.");
      return;
    }
    setError(null);
    await api.addAnnouncement(params.guildId, {
      ...form,
      scheduledFor: scheduleLocal ? new Date(scheduleLocal).toISOString() : null,
    });
    setForm(EMPTY);
    setScheduleLocal("");
    setError(null);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this announcement? If it hasn't sent yet, it never will."))) return;
    await api.deleteAnnouncement(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ANNOUNCEMENTS"
        title="Announcements"
        description="Compose a message or embed and post it now, or schedule it for a specific time."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <p className="font-medium mb-3">New Announcement</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Channel
            <Required />
          </label>
          <ChannelSelect guildId={params.guildId} value={form.channelId || null} onChange={(id) => setForm({ ...form, channelId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Message
            <Required />
          </label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={3}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />

          <SavedEmbedPicker guildId={params.guildId} value={form.savedEmbedId ?? null} onChange={(id) => setForm({ ...form, savedEmbedId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Schedule (optional)</label>
          <input
            type="datetime-local"
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={scheduleLocal}
            onChange={(e) => setScheduleLocal(e.target.value)}
          />
          <p className="text-xs text-slate-600 -mt-3 mb-4">Leave empty to post within the next minute.</p>

          <button onClick={send} disabled={!form.channelId} className="neon-button disabled:opacity-50">
            {scheduleLocal ? "Schedule" : "Send Now"}
          </button>
          <FormError message={error} />
        </NeonCard>

        <div className="space-y-4">
          <NeonCard>
            <p className="font-medium mb-3">Preview</p>
            <StickyPreview
              content={form.content}
              embedEnabled={false}
              embedTitle=""
              embedDescription={form.content}
              embedColor=""
              buttons={form.buttons}
              embedExtra={{}}
            />
            {form.savedEmbedId && (
              <p className="text-xs text-slate-500 mt-2">Preview reflects the saved embed once sent.</p>
            )}
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-3">Queued &amp; Recent</p>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">No announcements yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <p className="truncate">{r.embedTitle || r.content || "(embed only)"}</p>
                      <p className="text-xs text-slate-500">
                        #{r.channelId.slice(0, 6)} ·{" "}
                        {r.sentAt ? `sent ${new Date(r.sentAt).toLocaleString()}` : r.scheduledFor ? `scheduled ${new Date(r.scheduledFor).toLocaleString()}` : "sending soon"}
                      </p>
                    </div>
                    <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </NeonCard>
        </div>
      </div>
    </div>
  );
}
