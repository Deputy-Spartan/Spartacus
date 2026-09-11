"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { MarkdownToolbar } from "../../../../components/ui/MarkdownToolbar";
import { FormError } from "../../../../components/ui/FormError";
import { EmbedCard } from "../../../../components/embedCreator/EmbedCard";
import { ComponentRowEditor } from "../../../../components/embedCreator/ComponentRowEditor";
import { EmbedCreatorPreview } from "../../../../components/embedCreator/EmbedCreatorPreview";
import {
  api,
  type EmbedCreatorState,
  type EmbedCreatorEmbed,
  type EmbedCreatorComponentRow,
  type EmbedCreatorPresetRow,
} from "../../../../lib/api";

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
  const [state, setState] = useState<EmbedCreatorState>(emptyState());
  const [editingMessage, setEditingMessage] = useState<{ channelId: string; messageId: string; channelLabel: string } | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [messageLink, setMessageLink] = useState("");
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
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
          presetId: activePresetId ?? undefined,
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
          presetId: activePresetId ?? undefined,
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
          presetId: activePresetId ?? undefined,
        });
        setEditingMessage({ channelId: state.channelId, messageId: result.id, channelLabel: state.channelId });
        showToast("✅ Sent to channel");
      }
      if (activePresetId) api.getEmbedCreatorPresets(guildId).then(setPresets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    }
    setSending(false);
  }

  async function handleSaveAsPreset() {
    const name = prompt("Name this preset:");
    if (!name || !name.trim()) return;
    const saved = await api.saveEmbedCreatorPreset(guildId, name.trim(), state);
    setActivePresetId(saved.id);
    api.getEmbedCreatorPresets(guildId).then(setPresets);
    showToast(`Saved as "${name.trim()}"`);
  }
  function loadPreset(preset: EmbedCreatorPresetRow) {
    setState(preset.data);
    setActivePresetId(preset.id);
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
    setPresetMenuOpen(false);
    showToast(`Loaded "${preset.name}"`);
  }
  async function deletePreset(id: string, name: string) {
    await api.deleteEmbedCreatorPreset(guildId, id);
    setPresets((p) => p.filter((x) => x.id !== id));
    showToast(`Deleted "${name}"`);
  }
  function handleClearAll() {
    if (!confirm("Clear the message content, embeds, and components? This can't be undone.")) return;
    setState((s) => ({ ...emptyState(), deliveryMode: s.deliveryMode, channelId: s.channelId }));
    setEditingMessage(null);
    setActivePresetId(null);
    showToast("Cleared");
  }

  const sendLabel = editingMessage ? "Update Message" : state.deliveryMode === "webhook" ? "Send via Webhook" : "Send to channel";

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="EMBED_CREATOR"
        title="Embed Creator"
        description="Build a message with multiple embeds, buttons, and select menus — send it straight to a channel or through a webhook, with a live Discord preview as you go."
      />

      <NeonCard className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">How to use this</p>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
          <li>Write your message and add embeds/buttons below — the preview on the right updates as you go.</li>
          <li>
            Click <b className="text-slate-300">Save as Preset</b> to save it as a reusable "saved embed" — every other feature with a "Use a Saved Embed"
            option (Welcome, Announcements, Giveaways, Custom Commands, Sticky Messages, Birthdays, Custom Slash Commands, LFG) can then pick it instead of
            building its own embed from scratch.
          </li>
          <li>
            Pick <b className="text-slate-300">Send via Bot</b> and a channel, or <b className="text-slate-300">Send via Webhook</b> with a webhook URL, then hit Send.
          </li>
          <li>
            To fix a typo after sending, paste the message's link under <b className="text-slate-300">Edit an existing message</b> and hit Fetch — editing and hitting
            Send again updates it in place instead of posting a duplicate. Loading a preset that's already been sent does this automatically too.
          </li>
        </ol>
      </NeonCard>

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
            <MarkdownToolbar guildId={guildId} textareaRef={contentRef} value={state.content} onChange={(v) => setState((s) => ({ ...s, content: v }))} />
            <textarea
              ref={contentRef}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20"
              value={state.content}
              maxLength={2000}
              onChange={(e) => setState((s) => ({ ...s, content: e.target.value }))}
              placeholder="Optional text above the embed(s)"
            />
          </NeonCard>

          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm">Embeds ({state.embeds.length}/10)</p>
          </div>
          {state.embeds.map((em, i) => (
            <EmbedCard key={em.id} guildId={guildId} embed={em} index={i} onChange={(next) => updateEmbed(em.id, next)} onDuplicate={() => duplicateEmbed(em.id)} onRemove={() => removeEmbed(em.id)} />
          ))}
          <button onClick={addEmbed} disabled={state.embeds.length >= 10} className="w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40 mb-6">
            + Add Embed
          </button>

          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm">Buttons &amp; Select Menus ({state.components.length}/5 rows)</p>
          </div>
          {state.components.map((row, i) => (
            <ComponentRowEditor key={row.id} row={row} index={i} onChange={(next) => updateRow(row.id, next)} onRemove={() => removeRow(row.id)} />
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
              <div className="relative">
                <button onClick={() => setPresetMenuOpen((o) => !o)} className="text-xs text-slate-400 hover:text-slate-200">
                  Presets ▾
                </button>
                {presetMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPresetMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 bg-base-800 border border-white/10 rounded-lg p-1.5 min-w-[200px] shadow-xl z-20">
                      {presets.length === 0 && <p className="text-xs text-slate-500 px-2 py-2">No saved presets yet.</p>}
                      {presets.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-base-700 text-xs">
                          <span className="cursor-pointer flex-1 min-w-0" onClick={() => loadPreset(p)}>
                            <span className="block truncate">{p.name}</span>
                            <span className="block text-[10px] text-slate-500">{p.lastSentMessageId ? "Sent — loads ready to Update" : "Not sent yet"}</span>
                          </span>
                          <button onClick={() => deletePreset(p.id, p.name)} className="text-slate-500 hover:text-rose-400 shrink-0">
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <EmbedCreatorPreview state={state} />
          </NeonCard>

          <div className="flex gap-2">
            <button onClick={handleSend} disabled={sending} className="neon-button flex-1 disabled:opacity-50">
              {sending ? "Sending…" : sendLabel}
            </button>
            <button onClick={handleSaveAsPreset} className="neon-button-sm">
              Save as Preset
            </button>
            <button onClick={handleClearAll} className="text-xs text-slate-500 hover:text-rose-400 px-3">
              Clear All
            </button>
          </div>
          <FormError message={error} />
          {toast && <p className="text-xs text-emerald-400">{toast}</p>}
        </div>
      </div>
    </div>
  );
}
