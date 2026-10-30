"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { MentionTextarea } from "../../../../components/ui/MentionTextarea";
import { FormError } from "../../../../components/ui/FormError";
import { usePrompt } from "../../../../components/ui/ConfirmDialog";
import { EmbedCard } from "../../../../components/embedCreator/EmbedCard";
import { ComponentRowEditor } from "../../../../components/embedCreator/ComponentRowEditor";
import { EmbedCreatorPreview } from "../../../../components/embedCreator/EmbedCreatorPreview";
import { DiscordLimitsCard } from "../../../../components/embedCreator/DiscordLimitsCard";
import { checkDiscordLimits } from "../../../../lib/discordLimits";
import {
  api,
  type EmbedCreatorState,
  type EmbedCreatorEmbed,
  type EmbedCreatorComponentRow,
  type EmbedCreatorPresetRow,
} from "../../../../lib/api";

type PageTab = "saved" | "create";

function uid(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function emptyEmbed(): EmbedCreatorEmbed {
  return { id: uid("e"), color: "#7B99BC", fields: [] };
}
function emptyRow(): EmbedCreatorComponentRow {
  return { id: uid("r"), type: null, items: [] };
}
function emptyState(): EmbedCreatorState {
  return {
    content: "",
    deliveryMode: "bot",
    channelId: "",
    webhookUrl: "",
    profileName: "",
    profileAvatar: "",
    embeds: [emptyEmbed()],
    components: [],
  };
}

export default function EmbedCreatorPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const prompt = usePrompt();
  const [pageTab, setPageTab] = useState<PageTab>("saved");
  const [state, setState] = useState<EmbedCreatorState>(emptyState());
  const [editingMessage, setEditingMessage] = useState<{ channelId: string; messageId: string; channelLabel: string } | null>(null);
  const [editingPreset, setEditingPreset] = useState<EmbedCreatorPresetRow | null>(null);
  const [messageLink, setMessageLink] = useState("");
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);
  const [sending, setSending] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId]);

  // Mirrors `state` to any popped-out preview window (preview-popout page)
  // over BroadcastChannel — same-browser only, no server round-trip. The
  // popout asks for a resync right after it mounts, in case it opened after
  // the last edit already went out.
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`embed-creator-preview-${guildId}`);
    previewChannelRef.current = channel;
    channel.onmessage = (e) => {
      if (e.data?.type === "request-sync") channel.postMessage({ type: "state", state });
    };
    return () => {
      channel.close();
      previewChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);
  useEffect(() => {
    previewChannelRef.current?.postMessage({ type: "state", state });
  }, [state]);

  function openPreviewPopout() {
    window.open(
      `/embed-preview-popout/${guildId}`,
      "spartacus-embed-preview",
      "width=460,height=820,resizable=yes,noopener"
    );
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  function updateEmbed(id: string, next: EmbedCreatorEmbed) {
    setState((s) => ({ ...s, embeds: s.embeds.map((e) => (e.id === id ? next : e)) }));
  }
  function duplicateEmbed(id: string) {
    setState((s) => {
      if (s.embeds.length >= 10) return s;
      const idx = s.embeds.findIndex((e) => e.id === id);
      const copy = { ...JSON.parse(JSON.stringify(s.embeds[idx])), id: uid("e") };
      const embeds = [...s.embeds];
      embeds.splice(idx + 1, 0, copy);
      return { ...s, embeds };
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
  function addEmbed() {
    setState((s) => (s.embeds.length >= 10 ? s : { ...s, embeds: [...s.embeds, emptyEmbed()] }));
  }

  function updateRow(id: string, next: EmbedCreatorComponentRow) {
    setState((s) => ({ ...s, components: s.components.map((r) => (r.id === id ? next : r)) }));
  }
  function removeRow(id: string) {
    setState((s) => ({ ...s, components: s.components.filter((r) => r.id !== id) }));
  }
  function addRow() {
    setState((s) => (s.components.length >= 5 ? s : { ...s, components: [...s.components, emptyRow()] }));
  }

  async function handleFetch() {
    if (!messageLink.trim()) {
      setError("Paste a message link first.");
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const webhookUrl = state.deliveryMode === "webhook" ? state.webhookUrl : undefined;
      const result = await api.fetchEmbedCreatorMessage(guildId, messageLink.trim(), webhookUrl);
      setState((s) => ({
        ...s,
        content: result.content,
        embeds: result.embeds.length ? result.embeds.map((e) => ({ ...e, id: uid("e") })) : [emptyEmbed()],
      }));
      setEditingMessage({ channelId: result.channelId, messageId: result.messageId, channelLabel: result.channelId });
      showToast("Pulled message for editing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fetch that message.");
    }
    setFetching(false);
  }

  function cancelEditing() {
    setEditingMessage(null);
  }

  async function handleSend() {
    if (limits.hasErrors) {
      setError("Discord would reject this message — fix the problems listed under Discord Limits first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (editingMessage) {
        await api.updateEmbedCreatorMessage(guildId, {
          mode: state.deliveryMode,
          channelId: state.deliveryMode === "bot" ? editingMessage.channelId : undefined,
          webhookUrl: state.deliveryMode === "webhook" ? state.webhookUrl : undefined,
          messageId: editingMessage.messageId,
          content: state.content,
          embeds: state.embeds,
          components: state.components,
          presetId: editingPreset?.id ?? undefined,
        });
        showToast("✅ Message updated");
      } else if (state.deliveryMode === "webhook") {
        if (!state.webhookUrl.trim()) {
          setError("Add a webhook URL first.");
          setSending(false);
          return;
        }
        const result = await api.sendEmbedCreatorMessage(guildId, {
          mode: "webhook",
          webhookUrl: state.webhookUrl,
          profileName: state.profileName || undefined,
          profileAvatar: state.profileAvatar || undefined,
          content: state.content,
          embeds: state.embeds,
          components: state.components,
          presetId: editingPreset?.id ?? undefined,
        });
        setEditingMessage({ channelId: "", messageId: result.id, channelLabel: "webhook" });
        showToast("✅ Sent via webhook");
      } else {
        if (!state.channelId) {
          setError("Pick a channel first.");
          setSending(false);
          return;
        }
        const result = await api.sendEmbedCreatorMessage(guildId, {
          mode: "bot",
          channelId: state.channelId,
          content: state.content,
          embeds: state.embeds,
          components: state.components,
          presetId: editingPreset?.id ?? undefined,
        });
        setEditingMessage({ channelId: state.channelId, messageId: result.id, channelLabel: state.channelId });
        showToast("✅ Sent to channel");
      }
      if (editingPreset) api.getEmbedCreatorPresets(guildId).then(setPresets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    }
    setSending(false);
  }

  // "Save & Update" (editing an existing saved embed) reuses the same name,
  // which the API upserts by — every other module pointing at this preset's
  // id resolves the new data live the next time it sends, with nothing else
  // to push or refresh.
  async function handleUpdatePreset() {
    if (!editingPreset) return;
    setError(null);
    const saved = await api.saveEmbedCreatorPreset(guildId, editingPreset.name, state);
    setEditingPreset(saved);
    api.getEmbedCreatorPresets(guildId).then(setPresets);
    const sync = saved.sync;
    showToast(
      sync && sync.updated > 0
        ? `✅ "${editingPreset.name}" updated — pushed to ${sync.updated} live message${sync.updated === 1 ? "" : "s"} in Discord: ${sync.places.join(", ")}.${sync.failures?.length ? ` Couldn't edit: ${sync.failures.join("; ")}.` : ""}`
        : sync && sync.failed > 0
        ? `"${editingPreset.name}" saved, but couldn't edit: ${(sync.failures ?? []).join("; ") || `${sync.failed} posted message(s)`}.`
        : `✅ "${editingPreset.name}" updated — anywhere it's used will show the new version.`
    );
  }

  // Editing a saved embed saves and pushes to Discord by itself a moment after the last change.
  const autoSave = useAutoSave(editingPreset ? state : null, handleUpdatePreset, 2500, editingPreset?.id);

  // "Save as New" (from the Create tab) makes a brand new preset, then drops
  // the user into the Saved Embeds tab already editing it, so the flow reads
  // as "create it, then it lives in your saved library."
  async function handleSaveAsNew() {
    const name = await prompt("Name this embed:");
    if (!name || !name.trim()) return;
    setError(null);
    const saved = await api.saveEmbedCreatorPreset(guildId, name.trim(), state);
    setEditingPreset(saved);
    setPageTab("saved");
    api.getEmbedCreatorPresets(guildId).then(setPresets);
    showToast(`Saved "${name.trim()}" to your library.`);
  }

  function openPresetForEdit(preset: EmbedCreatorPresetRow) {
    setState(preset.data);
    setEditingPreset(preset);
    setError(null);
    // A preset that's already been sent somewhere carries its own
    // destination forward — hitting Send again edits that same live
    // message instead of posting a duplicate. The "✕" on the editing
    // badge below detaches it if a fresh post is what's actually wanted.
    if (preset.lastSentMessageId && preset.lastSentMode === "bot" && preset.lastSentChannelId) {
      setEditingMessage({ channelId: preset.lastSentChannelId, messageId: preset.lastSentMessageId, channelLabel: preset.lastSentChannelId });
      setState((s) => ({ ...s, deliveryMode: "bot", channelId: preset.lastSentChannelId! }));
    } else if (preset.lastSentMessageId && preset.lastSentMode === "webhook" && preset.lastSentWebhookUrl) {
      setEditingMessage({ channelId: "", messageId: preset.lastSentMessageId, channelLabel: "webhook" });
      setState((s) => ({ ...s, deliveryMode: "webhook", webhookUrl: preset.lastSentWebhookUrl! }));
    } else {
      setEditingMessage(null);
    }
  }

  function backToSavedList() {
    setEditingPreset(null);
    setEditingMessage(null);
    setState(emptyState());
  }

  async function deletePreset(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Anything still using it as a saved embed will fall back to its own default content.`)) return;
    await api.deleteEmbedCreatorPreset(guildId, id);
    setPresets((p) => p.filter((x) => x.id !== id));
    if (editingPreset?.id === id) backToSavedList();
    showToast(`Deleted "${name}"`);
  }

  function openCreateTab() {
    setPageTab("create");
    setEditingPreset(null);
    setEditingMessage(null);
    setState(emptyState());
    setError(null);
  }

  function handleClearAll() {
    if (!confirm("Clear the message content, embeds, and components? This can't be undone.")) return;
    setState((s) => ({ ...emptyState(), deliveryMode: s.deliveryMode, channelId: s.channelId }));
    setEditingMessage(null);
    showToast("Cleared");
  }

  const limits = checkDiscordLimits(state);
  const sendLabel = editingMessage ? "Update Message" : state.deliveryMode === "webhook" ? "Send via Webhook" : "Send to channel";
  const showBuilder = pageTab === "create" || (pageTab === "saved" && editingPreset);

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="EMBED_CREATOR"
        title="Embed Creator"
        description="Build reusable embeds shared across every module, or a one-off message — with a live Discord preview as you go."
      />

      <div className="flex gap-1 mb-4 border-b border-white/5">
        <button
          onClick={() => setPageTab("saved")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            pageTab === "saved" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Saved Embeds
        </button>
        <button
          onClick={openCreateTab}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            pageTab === "create" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          + Create New
        </button>
      </div>

      {pageTab === "saved" && !editingPreset && (
        <NeonCard className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">How to use this</p>
          <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
            <li>
              Every embed here is the same "saved embed" every other feature with a "Use a Saved Embed" option (Welcome, Announcements, Giveaways, Custom
              Commands, Sticky Messages, Birthdays, Ticket/Application Panels, Channel Locks, LFG) can pick instead of building its own from scratch.
            </li>
            <li>Click one below to edit it. Hit <b className="text-slate-300">Save &amp; Update</b> and every module using it picks up the change the next time it sends — nothing else to push or refresh.</li>
            <li>
              Need a brand new one? Use <b className="text-slate-300">+ Create New</b>.
            </li>
          </ol>
        </NeonCard>
      )}

      {pageTab === "saved" && !editingPreset && (
        <NeonCard>
          {presets.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No saved embeds yet.</p>
              <p className="text-xs text-slate-600 mb-4">Build one on the Create New tab, then it'll show up here.</p>
              <button onClick={openCreateTab} className="neon-button-sm">
                + Create New
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => openPresetForEdit(p)}>
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.lastSentMessageId ? "Sent — opens ready to Update Message" : "Not sent anywhere yet"}</p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => openPresetForEdit(p)} className="text-xs text-slate-500 hover:text-neon-blue">
                      Edit
                    </button>
                    <button onClick={() => deletePreset(p.id, p.name)} className="text-xs text-slate-500 hover:text-rose-400">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      )}

      {showBuilder && (
        <>
          {pageTab === "saved" && editingPreset && (
            <div className="flex items-center justify-between mb-4">
              <button onClick={backToSavedList} className="text-xs text-slate-500 hover:text-slate-300">
                ← Back to Saved Embeds
              </button>
              <span className="text-xs text-slate-500">
                Editing <b className="text-slate-300">{editingPreset.name}</b>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div>
              <NeonCard className="mb-4">
                <p className="font-medium mb-3">Send Settings</p>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setState((s) => ({ ...s, deliveryMode: "bot" }))}
                    className={`flex-1 rounded-lg p-2.5 text-sm border transition-colors ${
                      state.deliveryMode === "bot" ? "border-neon-blue bg-base-800 shadow-glow-blue text-slate-100" : "border-white/10 bg-base-950 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    Send via Bot
                  </button>
                  <button
                    onClick={() => setState((s) => ({ ...s, deliveryMode: "webhook" }))}
                    className={`flex-1 rounded-lg p-2.5 text-sm border transition-colors ${
                      state.deliveryMode === "webhook" ? "border-neon-blue bg-base-800 shadow-glow-blue text-slate-100" : "border-white/10 bg-base-950 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    Send via Webhook
                  </button>
                </div>

                {state.deliveryMode === "bot" ? (
                  <div className="mb-1">
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
                    <ChannelSelect guildId={guildId} value={state.channelId || null} onChange={(id) => setState((s) => ({ ...s, channelId: id }))} kind="text" placeholder="Select a channel…" />
                    <p className="text-xs text-slate-600 mt-2">
                      Sent via Bot always shows as "Spartacus" — Discord doesn't allow a bot token to change its name/avatar per message. Switch to{" "}
                      <b className="text-slate-400">Send via Webhook</b> to post under a custom name and avatar, or change the bot's own identity everywhere in{" "}
                      <a href={`/dashboard/${guildId}/bot-customization`} className="text-neon-blue hover:underline">Bot Customization</a>.
                    </p>
                  </div>
                ) : (
                  <div className="mb-1 space-y-3">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Webhook URL</label>
                      <input
                        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                        value={state.webhookUrl}
                        onChange={(e) => setState((s) => ({ ...s, webhookUrl: e.target.value }))}
                        placeholder="https://discord.com/api/webhooks/…"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Override Name</label>
                        <input
                          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                          value={state.profileName}
                          onChange={(e) => setState((s) => ({ ...s, profileName: e.target.value }))}
                          placeholder="Defaults to the webhook's own name"
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Override Avatar URL</label>
                        <input
                          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                          value={state.profileAvatar}
                          onChange={(e) => setState((s) => ({ ...s, profileAvatar: e.target.value }))}
                          placeholder="Defaults to the webhook's own avatar"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">
                      Applies when you first send it. Discord doesn't let an edit change a webhook message's name/avatar afterward — send a new message instead
                      if you need to change those.
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Edit an existing message</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                      value={messageLink}
                      onChange={(e) => setMessageLink(e.target.value)}
                      placeholder="Paste a message link — https://discord.com/channels/…"
                    />
                    <button onClick={handleFetch} disabled={fetching} className="neon-button-sm disabled:opacity-50 shrink-0">
                      {fetching ? "Fetching…" : "Fetch"}
                    </button>
                  </div>
                  {editingMessage && (
                    <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-300">
                      <span className="flex-1">✏️ Editing an existing message — sending will update it instead of posting new.</span>
                      <button onClick={cancelEditing} className="text-amber-300 hover:text-amber-100">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
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

              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-sm">Embeds ({state.embeds.length}/10)</p>
              </div>
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
              <button onClick={addEmbed} disabled={state.embeds.length >= 10} className="w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40 mb-6">
                + Add Embed
              </button>

              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-sm">Buttons &amp; Select Menus ({state.components.length}/5 rows)</p>
              </div>
              {state.components.map((row, i) => (
                <ComponentRowEditor key={row.id} guildId={guildId} row={row} index={i} onChange={(next) => updateRow(row.id, next)} onRemove={() => removeRow(row.id)} />
              ))}
              <button onClick={addRow} disabled={state.components.length >= 5} className="w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40">
                + Add Row
              </button>

              <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
                Link buttons work immediately. Plain buttons and select menus aren't wired to an action yet — clicking one in Discord replies with a clear "not connected" message instead of failing silently.
              </p>
            </div>

            <div className="lg:sticky lg:top-4 space-y-4">
              <NeonCard>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium">Live Preview</p>
                  <button
                    type="button"
                    onClick={openPreviewPopout}
                    className="text-[11px] text-slate-500 hover:text-neon-blue flex items-center gap-1"
                    title="Open the preview in its own window — handy on a second monitor"
                  >
                    ↗ Pop out
                  </button>
                </div>
                <EmbedCreatorPreview guildId={guildId} state={state} />
              </NeonCard>

              <DiscordLimitsCard report={limits} />

              {pageTab === "saved" && editingPreset ? (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleUpdatePreset} className="neon-button flex-1">
                    Save &amp; Update
                  </button>
                  <div className="basis-full"><SaveStatus status={autoSave} /></div>
                  <button onClick={handleSend} disabled={sending || limits.hasErrors} title={limits.hasErrors ? "Fix the Discord Limits problems first" : undefined} className="neon-button-sm disabled:opacity-50">
                    {sending ? "Sending…" : sendLabel}
                  </button>
                  <button onClick={() => deletePreset(editingPreset.id, editingPreset.name)} className="text-xs text-slate-500 hover:text-rose-400 px-3">
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleSaveAsNew} className="neon-button flex-1">
                    Save to Library
                  </button>
                  <button onClick={handleSend} disabled={sending || limits.hasErrors} title={limits.hasErrors ? "Fix the Discord Limits problems first" : undefined} className="neon-button-sm disabled:opacity-50">
                    {sending ? "Sending…" : sendLabel}
                  </button>
                  <button onClick={handleClearAll} className="text-xs text-slate-500 hover:text-rose-400 px-3">
                    Clear All
                  </button>
                </div>
              )}
              <FormError message={error} />
              {toast && <p className="text-xs text-emerald-400">{toast}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
