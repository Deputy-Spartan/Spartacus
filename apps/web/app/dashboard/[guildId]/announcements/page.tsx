"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { MentionTextarea } from "../../../../components/ui/MentionTextarea";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { DateTimeZoneField } from "../../../../components/ui/DateTimeZoneField";
import { FormError } from "../../../../components/ui/FormError";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { EmbedCard } from "../../../../components/embedCreator/EmbedCard";
import { ComponentRowEditor } from "../../../../components/embedCreator/ComponentRowEditor";
import { EmbedCreatorPreview } from "../../../../components/embedCreator/EmbedCreatorPreview";
import { DiscordLimitsCard } from "../../../../components/embedCreator/DiscordLimitsCard";
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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
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
  }

  // ---- embed/row editing (same behavior as the Embed Creator) ----
  function updateEmbed(id: string, next: EmbedCreatorEmbed) {
    setState((s) => ({ ...s, embeds: s.embeds.map((e) => (e.id === id ? next : e)) }));
  }
  function duplicateEmbed(id: string) {
    setState((s) => {
      if (s.embeds.length >= 10) return s;
      const i = s.embeds.findIndex((e) => e.id === id);
      const copy = { ...s.embeds[i], id: uid("e"), fields: s.embeds[i].fields.map((f) => ({ ...f })) };
      return { ...s, embeds: [...s.embeds.slice(0, i + 1), copy, ...s.embeds.slice(i + 1)] };
    });
  }
  function removeEmbed(id: string) {
    setState((s) => {
      const embeds = s.embeds.filter((e) => e.id !== id);
      return { ...s, embeds: embeds.length ? embeds : [emptyEmbed()] };
    });
  }
  function moveEmbed(from: number, to: number) {
    setState((s) => {
      if (to < 0 || to >= s.embeds.length || from === to) return s;
      const embeds = [...s.embeds];
      const [moved] = embeds.splice(from, 1);
      embeds.splice(to, 0, moved);
      return { ...s, embeds };
    });
  }
  function updateRow(id: string, next: EmbedCreatorComponentRow) {
    setState((s) => ({ ...s, components: s.components.map((r) => (r.id === id ? next : r)) }));
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

          <div ref={composerRef} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,1fr)] gap-5 items-start scroll-mt-4">
            <div className="min-w-0">
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

              <NeonCard className="mb-4">
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Schedule (optional)</label>
                <DateTimeZoneField value={scheduledFor} onChange={setScheduledFor} clearable />
                <p className="text-xs text-slate-600 mt-2">
                  {scheduledFor
                    ? `Hit ${editingId ? "Save & Schedule" : "Queue for Scheduled Time"} at the bottom of this page and it publishes automatically at this time. Don't click Publish Now, which sends it right away. Clear this anytime before then to publish manually instead.`
                    : "Leave blank to just queue it — you'll publish it yourself from the Queued list whenever you're ready."}
                </p>
              </NeonCard>

              <NeonCard className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium">Message</p>
                  <span className="text-[11px] text-slate-600 font-mono">{state.content.length}/2000</span>
                </div>
                <MentionTextarea
                  guildId={guildId}
                  value={state.content}
                  onChange={(v) => setState((s) => ({ ...s, content: v }))}
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20"
                  maxLength={2000}
                  placeholder="Optional text above the embed(s)"
                />
              </NeonCard>

              <p className="font-medium text-sm mb-3">Embeds ({state.embeds.length}/10)</p>
              {state.embeds.map((em, i) => (
                <EmbedCard
                  key={em.id}
                  guildId={guildId}
                  embed={em}
                  index={i}
                  onChange={(next) => updateEmbed(em.id, next)}
                  onDuplicate={() => duplicateEmbed(em.id)}
                  onRemove={() => removeEmbed(em.id)}
                  onMoveUp={i > 0 ? () => moveEmbed(i, i - 1) : undefined}
                  onMoveDown={i < state.embeds.length - 1 ? () => moveEmbed(i, i + 1) : undefined}
                  dropTarget={dragOver === i && dragFrom !== null && dragFrom !== i}
                  dragProps={{
                    draggable: true,
                    onDragStart: (e) => {
                      setDragFrom(i);
                      e.dataTransfer.effectAllowed = "move";
                    },
                    onDragOver: (e) => {
                      e.preventDefault();
                      if (dragOver !== i) setDragOver(i);
                    },
                    onDrop: (e) => {
                      e.preventDefault();
                      if (dragFrom !== null) moveEmbed(dragFrom, i);
                      setDragFrom(null);
                      setDragOver(null);
                    },
                    onDragEnd: () => {
                      setDragFrom(null);
                      setDragOver(null);
                    },
                  }}
                />
              ))}
              <button
                onClick={() => setState((s) => (s.embeds.length >= 10 ? s : { ...s, embeds: [...s.embeds, emptyEmbed()] }))}
                disabled={state.embeds.length >= 10}
                className="w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40 mb-6"
              >
                + Add Embed
              </button>

              <p className="font-medium text-sm mb-3">Buttons &amp; Select Menus ({state.components.length}/5 rows)</p>
              {state.components.map((row, i) => (
                <ComponentRowEditor
                  key={row.id}
                  guildId={guildId}
                  row={row}
                  index={i}
                  onChange={(next) => updateRow(row.id, next)}
                  onRemove={() => setState((s) => ({ ...s, components: s.components.filter((r) => r.id !== row.id) }))}
                />
              ))}
              <button
                onClick={() => setState((s) => (s.components.length >= 5 ? s : { ...s, components: [...s.components, emptyRow()] }))}
                disabled={state.components.length >= 5}
                className="w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40 mb-6"
              >
                + Add Row
              </button>

              <NeonCard>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Use a saved embed instead (optional)</label>
                <SavedEmbedPicker guildId={guildId} value={savedEmbedId} onChange={(id) => setSavedEmbedId(id)} />
                <p className="text-xs text-slate-600 -mt-3 mb-4">
                  Picking one posts that saved embed instead of everything built above — it doesn't save this announcement as a template.
                </p>

                <button onClick={save} disabled={!channelId || saving || limits.hasErrors} className="neon-button disabled:opacity-50">
                  {saving ? "Saving…" : editingId ? (scheduledFor ? "Save & Schedule" : "Save Changes") : scheduledFor ? "Queue for Scheduled Time" : "Save to Queue"}
                </button>
                <FormError message={error} />
              </NeonCard>
            </div>

            <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
              <NeonCard>
                <p className="font-medium mb-3">Live Preview</p>
                <EmbedCreatorPreview guildId={guildId} state={savedPreset ? { ...state, ...savedPreset.data } : state} />
                {savedPreset && <p className="text-xs text-slate-500 mt-2">Showing the saved embed "{savedPreset.name}" — that's what will post.</p>}
              </NeonCard>
              <DiscordLimitsCard report={limits} />
            </div>
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
