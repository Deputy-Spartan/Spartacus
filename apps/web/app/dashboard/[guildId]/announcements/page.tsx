"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { ButtonsEditor } from "../../../../components/ui/ButtonsEditor";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { parseEmbedExtra, EMPTY_EMBED_EXTRA } from "../../../../lib/embedExtra";
import { api, type AnnouncementInput, type AnnouncementRow, type DiscordChannelOption } from "../../../../lib/api";

type Tab = "active" | "create";

const COLOR_PRESETS = ["#00E5FF", "#5865F2", "#7CB88F", "#D8AE6B", "#C77B7B", "#B98AD1"];

const EMPTY: AnnouncementInput = {
  channelId: "",
  content: "",
  embedEnabled: false,
  embedTitle: "",
  embedColor: "#00E5FF",
  buttons: [],
  scheduledFor: null,
  embedExtra: EMPTY_EMBED_EXTRA,
  savedEmbedId: null,
};

function rowToInput(r: AnnouncementRow): AnnouncementInput {
  return {
    channelId: r.channelId,
    content: r.content ?? "",
    embedEnabled: r.embedEnabled,
    embedTitle: r.embedTitle ?? "",
    embedColor: r.embedColor ?? "#00E5FF",
    buttons: r.buttons,
    scheduledFor: r.scheduledFor,
    embedExtra: parseEmbedExtra(r.embedExtra),
    savedEmbedId: r.savedEmbedId ?? null,
  };
}

export default function AnnouncementsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [form, setForm] = useState<AnnouncementInput>(EMPTY);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
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
    setEditingId(null);
    setResending(false);
    setError(null);
  }

  // Only a queued row can be opened for editing — Discord already has the
  // live message for a sent one, so there'd be nothing for an edit here to
  // actually change. Resend (below) is the equivalent for sent history.
  function openEdit(r: AnnouncementRow) {
    setEditingId(r.id);
    setResending(false);
    setForm(rowToInput(r));
    setScheduleLocal(r.scheduledFor ? r.scheduledFor.slice(0, 16) : "");
    setError(null);
    setTab("create");
  }

  // Loads a past (already-sent) announcement's content into the compose
  // form as a starting point for a brand-new queued announcement — it
  // never touches the original sent row, which stays exactly as it was.
  function openResend(r: AnnouncementRow) {
    setEditingId(null);
    setResending(true);
    setForm(rowToInput(r));
    setScheduleLocal("");
    setError(null);
    setTab("create");
  }

  async function save() {
    const hasEmbedContent = form.embedEnabled && (form.content.trim() || form.embedTitle.trim());
    if (!form.channelId || !(form.content.trim() || form.savedEmbedId || hasEmbedContent)) {
      setError("Select a channel and enter a message, build an embed, or pick a saved embed before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    const body = { ...form, scheduledFor: scheduleLocal ? new Date(scheduleLocal).toISOString() : null };
    try {
      if (editingId) await api.updateAnnouncement(params.guildId, editingId, body);
      else await api.addAnnouncement(params.guildId, body);
      resetForm();
      setTab("active");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save this announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(r: AnnouncementRow) {
    if (!(await confirm(`Publish this to ${channelLabel(r.channelId)} right now? Once sent it can't be edited.`, { confirmLabel: "Publish" })))
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
    if (editingId === id) resetForm();
    refresh();
  }

  const queued = rows.filter((r) => !r.sentAt);
  const sent = rows.filter((r) => r.sentAt);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ANNOUNCEMENTS"
        title="Announcements"
        description="Compose a message or build an embed, queue it, then publish it when you're ready."
      />

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 mb-5">
        <p className="text-xs text-amber-300">
          A queued announcement — including its schedule — can be edited or removed anytime before it publishes.{" "}
          <strong>Once published it's final and can't be edited</strong>; find it under Recently Sent and use{" "}
          <strong>Resend</strong> to send it (or a tweaked copy of it) again as a new announcement.
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

      {tab === "active" && (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Queued</p>
            {queued.length === 0 ? (
              <NeonCard>
                <div className="text-center py-10">
                  <p className="text-sm text-slate-400 mb-1">Nothing queued.</p>
                  <p className="text-xs text-slate-600 mb-4">Compose one, queue it, and publish it whenever you're ready — or schedule it.</p>
                  <button onClick={() => setTab("create")} className="neon-button-sm">
                    + Compose New
                  </button>
                </div>
              </NeonCard>
            ) : (
              <NeonCard>
                <div className="divide-y divide-white/5">
                  {queued.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                      <div className="min-w-0">
                        <p className="truncate">{r.embedTitle || r.content || "(embed only)"}</p>
                        <p className="text-xs text-slate-500">
                          {channelLabel(r.channelId)} ·{" "}
                          {r.scheduledFor ? `publishes ${new Date(r.scheduledFor).toLocaleString()}` : "no schedule — publish manually"}
                        </p>
                      </div>
                      <button onClick={() => openEdit(r)} className="text-slate-500 hover:text-neon-blue text-xs shrink-0">
                        Edit
                      </button>
                      <button
                        onClick={() => publish(r)}
                        disabled={publishingId === r.id}
                        className="text-neon-blue hover:underline text-xs shrink-0 disabled:opacity-50"
                      >
                        {publishingId === r.id ? "Publishing…" : "Publish Now"}
                      </button>
                      <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </NeonCard>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recently Sent</p>
            {sent.length === 0 ? (
              <NeonCard>
                <p className="text-sm text-slate-500 py-4 text-center">Nothing published yet — it'll show up here once something is.</p>
              </NeonCard>
            ) : (
              <NeonCard>
                <div className="divide-y divide-white/5">
                  {sent.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                      <div className="min-w-0">
                        <p className="truncate">{r.embedTitle || r.content || "(embed only)"}</p>
                        <p className="text-xs text-slate-500">
                          {channelLabel(r.channelId)} · published {new Date(r.sentAt as string).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => openResend(r)} className="text-neon-blue hover:underline text-xs shrink-0">
                        Resend
                      </button>
                      <button onClick={() => remove(r.id)} className="text-slate-600 hover:text-rose-400 text-xs shrink-0">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </NeonCard>
            )}
          </div>
        </div>
      )}

      {tab === "create" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium">{editingId ? "Edit Queued Announcement" : resending ? "Resend as New Announcement" : "New Announcement"}</p>
              {(editingId || resending) && (
                <button
                  onClick={() => {
                    resetForm();
                    setTab("active");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Cancel
                </button>
              )}
            </div>

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
              placeholder={form.embedEnabled ? "Also used as the embed's description" : undefined}
            />

            <div className="flex items-center justify-between mb-3 rounded-lg border border-white/10 bg-base-950 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Build an Embed</p>
                <p className="text-xs text-slate-500">Add a title, color, and rich fields around your message above.</p>
              </div>
              <ToggleSwitch enabled={form.embedEnabled} onChange={(v) => setForm({ ...form, embedEnabled: v })} label="Build an embed" />
            </div>

            {form.embedEnabled && (
              <>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                  value={form.embedTitle}
                  onChange={(e) => setForm({ ...form, embedTitle: e.target.value })}
                  placeholder="Optional"
                />

                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="color"
                    className="h-9 w-11 rounded-lg border border-white/10 bg-base-950 cursor-pointer shrink-0"
                    value={form.embedColor}
                    onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                  />
                  <input
                    className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                    value={form.embedColor}
                    onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                  />
                </div>
                <div className="flex gap-1.5 mb-4">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => setForm({ ...form, embedColor: c })}
                      className="w-[18px] h-[18px] rounded border border-white/10 hover:scale-110 transition-transform"
                      style={{ background: c }}
                    />
                  ))}
                </div>

                <EmbedExtraFields
                  guildId={params.guildId}
                  value={form.embedExtra ?? EMPTY_EMBED_EXTRA}
                  onChange={(v) => setForm({ ...form, embedExtra: v })}
                />
              </>
            )}

            <div className="mt-4 mb-4">
              <ButtonsEditor guildId={params.guildId} buttons={form.buttons} onChange={(next) => setForm({ ...form, buttons: next })} />
            </div>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Use a saved embed instead (optional)</label>
            <SavedEmbedPicker guildId={params.guildId} value={form.savedEmbedId ?? null} onChange={(id) => setForm({ ...form, savedEmbedId: id })} />
            <p className="text-xs text-slate-600 -mt-3 mb-4">
              Picking one here uses it as this announcement's content instead of the embed built above — it doesn't save this
              announcement as a template.
            </p>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Schedule (optional)</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="datetime-local"
                className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={scheduleLocal}
                onChange={(e) => setScheduleLocal(e.target.value)}
              />
              {scheduleLocal && (
                <button
                  type="button"
                  onClick={() => setScheduleLocal("")}
                  className="text-xs text-slate-500 hover:text-rose-400 px-2 py-2.5 shrink-0"
                  title="Clear schedule"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 mb-4">
              {scheduleLocal
                ? "Publishes automatically at this time — no need to come back and click Publish. Clear it anytime before then to publish manually instead."
                : "Leave blank to just queue it — you'll publish it yourself from the Queued tab whenever you're ready."}
            </p>

            <button onClick={save} disabled={!form.channelId || saving} className="neon-button disabled:opacity-50">
              {saving ? "Saving…" : editingId ? "Save Changes" : scheduleLocal ? "Queue for Scheduled Time" : "Save to Queue"}
            </button>
            <FormError message={error} />
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-3">Preview</p>
            <StickyPreview
              content={form.content}
              embedEnabled={form.embedEnabled}
              embedTitle={form.embedTitle}
              embedDescription={form.content}
              embedColor={form.embedColor}
              buttons={form.buttons}
              embedExtra={form.embedExtra ?? EMPTY_EMBED_EXTRA}
            />
            {form.savedEmbedId && <p className="text-xs text-slate-500 mt-2">Preview reflects the saved embed once published.</p>}
          </NeonCard>
        </div>
      )}
    </div>
  );
}
