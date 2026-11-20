"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { DateTimeZoneField } from "../../../../components/ui/DateTimeZoneField";
import { FormError } from "../../../../components/ui/FormError";
import { ModuleMessage } from "../../../../components/embedCreator/ModuleMessage";
import { checkDiscordLimits } from "../../../../lib/discordLimits";
import { parseEmbedExtra } from "../../../../lib/embedExtra";
import { formatDateTime } from "../../../../lib/timeZones";
import {
  api,
  type AnnouncementRow,
  type DiscordChannelOption,
  type EmbedCreatorComponentRow,
  type EmbedCreatorEmbed,
  type EmbedCreatorPresetRow,
  type EmbedCreatorState,
} from "../../../../lib/api";

type Tab = "compose" | "sent";

function uid(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function emptyEmbed(): EmbedCreatorEmbed {
  return { id: uid("e"), color: "#00E5FF", fields: [] };
}
function emptyRow(): EmbedCreatorComponentRow {
  return { id: uid("r"), type: null, items: [] };
}
// The editor reuses the Embed Creator's state shape; the delivery fields
// are unused here (announcements always post as the bot, to the channel
// picked above) but EmbedCreatorPreview expects them.
function emptyState(): EmbedCreatorState {
  return { content: "", deliveryMode: "bot", channelId: "", webhookUrl: "", profileName: "", profileAvatar: "", embeds: [emptyEmbed()], components: [] };
}

// Opens any row in the editor — one composed here already has creatorData;
// an older single-embed row is converted (its link buttons become a button
// row) so editing or resending it carries everything over.
function rowToState(r: AnnouncementRow): EmbedCreatorState {
  const base = emptyState();
  if (r.creatorData) {
    return {
      ...base,
      content: r.creatorData.content ?? "",
      embeds: r.creatorData.embeds?.length ? r.creatorData.embeds : [emptyEmbed()],
      components: r.creatorData.components ?? [],
    };
  }
  const extra = parseEmbedExtra(r.embedExtra);
  const embed: EmbedCreatorEmbed = r.embedEnabled
    ? {
        id: uid("e"),
        title: r.embedTitle ?? "",
        description: r.embedDescription ?? "",
        color: r.embedColor ?? "#00E5FF",
        authorName: extra.authorName,
        authorIconUrl: extra.authorIconUrl,
        authorUrl: extra.authorUrl,
        thumbnailUrl: extra.thumbnailUrl,
        imageUrl: extra.imageUrl,
        footerText: extra.footerText,
        footerIconUrl: extra.footerIconUrl,
        timestamp: extra.timestamp,
        fields: extra.fields ?? [],
      }
    : emptyEmbed();
  return {
    ...base,
    content: r.content ?? "",
    embeds: [embed],
    components: r.buttons.length
      ? [{ id: uid("r"), type: "buttons", items: r.buttons.map((b) => ({ id: uid("b"), kind: "link" as const, label: b.label, url: b.url })) }]
      : [],
  };
}

function rowLabel(r: AnnouncementRow): string {
  return r.embedTitle || r.content || r.embedDescription || "(embed only)";
}

export default function AnnouncementsPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("compose");
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);

  const [channelId, setChannelId] = useState("");
  const [state, setState] = useState<EmbedCreatorState>(emptyState);
  const [savedEmbedId, setSavedEmbedId] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Remounts the message box for each announcement opened or started.
  const [formKey, setFormKey] = useState(() => `new-${Date.now().toString(36)}`);
  const composerRef = useRef<HTMLDivElement>(null);

  function refresh() {
    api.getAnnouncements(guildId).then(setRows);
    api.getDiscordChannels(guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }
  useEffect(refresh, [guildId]);
  useEffect(() => {
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId]);

  function channelLabel(id: string): string {
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }

  function resetForm() {
    setChannelId("");
    setState(emptyState());
    setSavedEmbedId(null);
    setScheduledFor("");
    setEditingId(null);
    setResending(false);
    setError(null);
    setFormKey(`new-${Date.now().toString(36)}`);
  }

  // Only a queued row can be edited — Discord already has the live message
  // for a sent one. Resend is the equivalent for sent history: it loads a
  // copy as a brand-new announcement and never touches the original.
  function openRow(r: AnnouncementRow, mode: "edit" | "resend") {
    setEditingId(mode === "edit" ? r.id : null);
    setResending(mode === "resend");
    setChannelId(r.channelId);
    setState(rowToState(r));
    setSavedEmbedId(r.savedEmbedId ?? null);
    setFormKey(`${mode}-${r.id}-${Date.now().toString(36)}`);
    setScheduledFor(mode === "edit" && r.scheduledFor ? r.scheduledFor : "");
    setError(null);
    setNotice(null);
    setTab("compose");
    // Waits a frame so the form exists when coming from the Recently Sent tab.
    requestAnimationFrame(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const savedPreset = savedEmbedId ? presets.find((p) => p.id === savedEmbedId) ?? null : null;
  const limits = checkDiscordLimits(savedPreset ? savedPreset.data : state);

  async function save() {
    if (!channelId) return setError("Pick a channel to post this announcement in.");
    if (limits.hasErrors) return setError("Discord would reject this message — fix the problems listed under Discord Limits first.");
    setError(null);
    setSaving(true);
    const body = {
      channelId,
      creatorData: { content: state.content, embeds: state.embeds, components: state.components },
      savedEmbedId,
      scheduledFor: scheduledFor || null,
    };
    try {
      if (editingId) await api.updateAnnouncement(guildId, editingId, body);
      else await api.addAnnouncement(guildId, body);
      setNotice(scheduledFor ? `✅ Scheduled for ${formatDateTime(scheduledFor)}.` : editingId ? "✅ Queued announcement updated." : "✅ Saved to the queue — publish it below when you're ready.");
      resetForm();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save this announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function publish(r: AnnouncementRow) {
    const skipsSchedule = r.scheduledFor ? ` It's scheduled for ${formatDateTime(r.scheduledFor)}, and this sends it now instead.` : "";
    if (!(await confirm(`Publish this to ${channelLabel(r.channelId)} right now?${skipsSchedule} Once sent it can't be edited.`, { confirmLabel: "Publish" })))
      return;
    setPublishingId(r.id);
    try {
      await api.publishAnnouncement(guildId, r.id);
      setNotice("✅ Published — find it under Recently Sent.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish this announcement.");
    } finally {
      setPublishingId(null);
    }
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this announcement? If it hasn't published yet, it never will."))) return;
    await api.deleteAnnouncement(guildId, id);
    if (editingId === id) resetForm();
    refresh();
  }

  const queued = rows.filter((r) => !r.sentAt);
  const sent = rows.filter((r) => r.sentAt);
  const tabClass = (t: Tab) =>
    ["px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0", tab === t ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300"].join(" ");

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
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

      <div className="flex gap-1 mb-5 border-b border-white/5 overflow-x-auto">
        <button onClick={() => setTab("compose")} className={tabClass("compose")}>
          Announcement{queued.length > 0 ? ` (${queued.length} queued)` : ""}
        </button>
        <button onClick={() => setTab("sent")} className={tabClass("sent")}>
          Recently Sent{sent.length > 0 ? ` (${sent.length})` : ""}
        </button>
      </div>

      {tab === "compose" && (
        <div className="space-y-5">
          {queued.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Queued</p>
              <NeonCard>
                <div className="divide-y divide-white/5">
                  {queued.map((r) => (
                    <div key={r.id} className={`flex flex-wrap items-center justify-between py-2.5 text-sm gap-x-4 gap-y-2 ${editingId === r.id ? "text-neon-blue" : ""}`}>
                      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                        <p className="truncate">{rowLabel(r)}</p>
                        <p className="text-xs text-slate-500">
                          {channelLabel(r.channelId)} ·{" "}
                          {r.scheduledFor ? `publishes ${formatDateTime(r.scheduledFor)}` : "no schedule — publish manually"}
                        </p>
                      </div>
                      <button onClick={() => openRow(r, "edit")} className="text-slate-500 hover:text-neon-blue text-xs shrink-0 py-1">
                        {editingId === r.id ? "Editing…" : "Edit"}
                      </button>
                      {/* Publishing sends what's saved, so it's hidden while unsaved edits are open. */}
                      {editingId !== r.id && (
                        <button
                          onClick={() => publish(r)}
                          disabled={publishingId === r.id}
                          className="text-neon-blue hover:underline text-xs shrink-0 py-1 disabled:opacity-50"
                        >
                          {publishingId === r.id ? "Publishing…" : "Publish Now"}
                        </button>
                      )}
                      <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0 py-1">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </NeonCard>
            </div>
          )}

          {notice && <p className="text-xs text-emerald-400">{notice}</p>}

          <div ref={composerRef} className="scroll-mt-4">
            <div className="min-w-0 max-w-3xl">
              <NeonCard className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium">{editingId ? "Edit Queued Announcement" : resending ? "Resend as New Announcement" : "New Announcement"}</p>
                  {(editingId || resending) && (
                    <button onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-300">
                      Cancel
                    </button>
                  )}
                </div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                  Channel
                  <Required />
                </label>
                <ChannelSelect guildId={guildId} value={channelId || null} onChange={(id) => setChannelId(id)} />
              </NeonCard>

              <NeonCard className="mb-6">
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Schedule (optional)</label>
                <DateTimeZoneField value={scheduledFor} onChange={setScheduledFor} clearable />
                <p className="text-xs text-slate-600 mt-2">
                  {scheduledFor
                    ? `Hit ${editingId ? "Save & Schedule" : "Queue for Scheduled Time"} at the bottom of this page and it publishes automatically at this time. Don't click Publish Now, which sends it right away. Clear this anytime before then to publish manually instead.`
                    : "Leave blank to just queue it — you'll publish it yourself from the Queued list whenever you're ready."}
                </p>
              </NeonCard>
            </div>

            <ModuleMessage
              key={formKey}
              guildId={guildId}
              title="Announcement"
              description="What gets posted. Picking a saved embed doesn't save this announcement as a template."
              ownerKey={`announcement:${formKey}`}
              savedEmbedId={savedEmbedId}
              onSavedEmbedChange={setSavedEmbedId}
              seed={() => ({ content: "", embeds: [emptyEmbed()], components: [] })}
              inline={{
                value: { content: state.content, embeds: state.embeds, components: state.components },
                onChange: (next) => setState((s) => ({ ...s, ...next })),
              }}
            >
              <button onClick={save} disabled={!channelId || saving || limits.hasErrors} className="neon-button disabled:opacity-50">
                {saving ? "Saving…" : editingId ? (scheduledFor ? "Save & Schedule" : "Save Changes") : scheduledFor ? "Queue for Scheduled Time" : "Save to Queue"}
              </button>
              <FormError message={error} />
            </ModuleMessage>
          </div>
        </div>
      )}

      {tab === "sent" &&
        (sent.length === 0 ? (
          <NeonCard>
            <p className="text-sm text-slate-500 py-4 text-center">Nothing published yet — it'll show up here once something is.</p>
          </NeonCard>
        ) : (
          <NeonCard>
            <div className="divide-y divide-white/5">
              {sent.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{rowLabel(r)}</p>
                    <p className="text-xs text-slate-500">
                      {channelLabel(r.channelId)} · published {new Date(r.sentAt as string).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => openRow(r, "resend")} className="text-neon-blue hover:underline text-xs shrink-0">
                    Resend
                  </button>
                  <button onClick={() => remove(r.id)} className="text-slate-600 hover:text-rose-400 text-xs shrink-0">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </NeonCard>
        ))}
    </div>
  );
}
