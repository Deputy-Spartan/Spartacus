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
import { api, type AnnouncementInput, type AnnouncementRow, type DiscordChannelOption } from "../../../../lib/api";

type Tab = "active" | "create";

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
  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [form, setForm] = useState<AnnouncementInput>(EMPTY);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getAnnouncements(params.guildId).then(setRows);
    api.getDiscordChannels(params.guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }
  useEffect(refresh, [params.guildId]);

  function channelLabel(id: string): string {
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }

  function resetForm() {
    setForm(EMPTY);
    setScheduleLocal("");
    setError(null);
  }

  // Composing and saving only ever creates a new queued announcement —
  // there is no edit/update here by design (see the banner above the form).
  async function saveToQueue() {
    if (!form.channelId || (!form.content && !form.savedEmbedId)) {
      setError("Select a channel and enter a message or pick a saved embed before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    const body = { ...form, scheduledFor: scheduleLocal ? new Date(scheduleLocal).toISOString() : null };
    try {
      await api.addAnnouncement(params.guildId, body);
      resetForm();
      setTab("active");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue this announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(r: AnnouncementRow) {
    if (!(await confirm(`Publish this to ${channelLabel(r.channelId)} right now? This can't be undone or edited afterward.`, { confirmLabel: "Publish" })))
      return;
    setPublishingId(r.id);
    try {
      await api.publishAnnouncement(params.guildId, r.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish this announcement.");
    } finally {
      setPublishingId(null);
    }
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this announcement? If it hasn't published yet, it never will."))) return;
    await api.deleteAnnouncement(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ANNOUNCEMENTS"
        title="Announcements"
        description="Compose a message or embed, queue it, then publish it when you're ready."
      />

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 mb-5">
        <p className="text-xs text-amber-300">
          <strong>Announcements aren't saved as reusable templates.</strong> Saving one only queues it — it can't be edited or updated
          afterward. If something's wrong, delete the queued copy and compose a fresh one. Publishing (manually or on schedule) is the
          one final step. Want to reuse a design across multiple announcements? Build it in Embed Creator and pick it below as a
          starting point instead.
        </p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Queued &amp; Sent
        </button>
        <button
          onClick={() => {
            resetForm();
            setTab("create");
          }}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "create" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          + Compose New
        </button>
      </div>

      {tab === "active" &&
        (rows.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No announcements yet.</p>
              <p className="text-xs text-slate-600 mb-4">Compose one, queue it, and publish it whenever you're ready — or schedule it.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Compose New
              </button>
            </div>
          </NeonCard>
        ) : (
          <NeonCard>
            <div className="divide-y divide-white/5">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{r.embedTitle || r.content || "(embed only)"}</p>
                    <p className="text-xs text-slate-500">
                      {channelLabel(r.channelId)} ·{" "}
                      {r.sentAt
                        ? `published ${new Date(r.sentAt).toLocaleString()}`
                        : r.scheduledFor
                          ? `publishes ${new Date(r.scheduledFor).toLocaleString()}`
                          : "queued — not scheduled"}
                    </p>
                  </div>
                  {!r.sentAt && (
                    <button
                      onClick={() => publish(r)}
                      disabled={publishingId === r.id}
                      className="text-neon-blue hover:underline text-xs shrink-0 disabled:opacity-50"
                    >
                      {publishingId === r.id ? "Publishing…" : "Publish Now"}
                    </button>
                  )}
                  <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </NeonCard>
        ))}

      {tab === "create" && (
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

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Use a saved embed instead (optional)</label>
            <SavedEmbedPicker guildId={params.guildId} value={form.savedEmbedId ?? null} onChange={(id) => setForm({ ...form, savedEmbedId: id })} />
            <p className="text-xs text-slate-600 -mt-3 mb-4">
              Picking one here only uses it as this announcement's content — it doesn't save this announcement as a template.
            </p>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Schedule (optional)</label>
            <input
              type="datetime-local"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-2"
              value={scheduleLocal}
              onChange={(e) => setScheduleLocal(e.target.value)}
            />
            <p className="text-xs text-slate-600 mb-4">
              {scheduleLocal
                ? "Publishes automatically at this time — no need to come back and click Publish."
                : "Leave blank to just queue it — you'll publish it yourself from the Queued & Sent tab whenever you're ready."}
            </p>

            <button onClick={saveToQueue} disabled={!form.channelId || saving} className="neon-button disabled:opacity-50">
              {saving ? "Saving…" : scheduleLocal ? "Queue for Scheduled Time" : "Save to Queue"}
            </button>
            <FormError message={error} />
          </NeonCard>

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
            {form.savedEmbedId && <p className="text-xs text-slate-500 mt-2">Preview reflects the saved embed once published.</p>}
          </NeonCard>
        </div>
      )}
    </div>
  );
}
