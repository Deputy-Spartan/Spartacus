"use client";

import { useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { MentionTextarea } from "../ui/MentionTextarea";
import { SavedEmbedPicker } from "./SavedEmbedPicker";
import { EmbedCard } from "./EmbedCard";
import { ComponentRowEditor } from "./ComponentRowEditor";
import type { EmbedCreatorComponentRow, EmbedCreatorEmbed, EmbedCreatorState } from "../../lib/api";

export type DesignedMessage = Pick<EmbedCreatorState, "content" | "embeds" | "components">;

function uid(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function emptyEmbed(): EmbedCreatorEmbed {
  return { id: uid("e"), color: "#00E5FF", fields: [] };
}
function emptyRow(): EmbedCreatorComponentRow {
  return { id: uid("r"), type: null, items: [] };
}

// The preview and the limits check use the Embed Creator's full state shape.
// Delivery fields don't apply to a module's own message, which the bot
// always posts to that module's channel.
export function toCreatorState(data: DesignedMessage): EmbedCreatorState {
  return { deliveryMode: "bot", channelId: "", webhookUrl: "", profileName: "", profileAvatar: "", content: data.content ?? "", embeds: data.embeds ?? [], components: data.components ?? [] };
}

function fill(text: string | undefined, tokens: Record<string, string>): string | undefined {
  if (!text) return text;
  let out = text;
  for (const [token, value] of Object.entries(tokens)) out = out.split(token).join(value);
  return out;
}

// Swaps {placeholders} for real examples, so a preview reads the way the
// post will.
export function withTokens(state: EmbedCreatorState, tokens: Record<string, string>): EmbedCreatorState {
  return {
    ...state,
    content: fill(state.content, tokens) ?? "",
    embeds: state.embeds.map((em) => ({
      ...em,
      authorName: fill(em.authorName, tokens),
      title: fill(em.title, tokens),
      description: fill(em.description, tokens),
      footerText: fill(em.footerText, tokens),
      fields: em.fields.map((f) => ({ ...f, name: fill(f.name, tokens) ?? "", value: fill(f.value, tokens) ?? "" })),
    })),
    components: state.components.map((row) => ({
      ...row,
      items: row.items.map((it) => ({ ...it, label: fill(it.label, tokens) ?? "" })),
    })),
  };
}

// Click-to-copy chips for a module's {placeholders}.
export function TokenChips({ tokens, note }: { tokens: Array<{ token: string; description: string }>; note?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(token: string) {
    navigator.clipboard?.writeText(token).catch(() => null);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <NeonCard className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium">Placeholders</p>
        <span className="text-[11px] text-slate-600">Click one to copy it</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((t) => (
          <button
            key={t.token}
            type="button"
            title={t.description}
            onClick={() => copy(t.token)}
            className="bg-base-800 border border-white/10 hover:border-neon-blue/40 rounded-full px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-neon-blue transition-colors"
          >
            {copied === t.token ? "Copied ✓" : t.token}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-600 mt-2">Paste these anywhere in the message, an embed or a button label. {note}</p>
    </NeonCard>
  );
}

const dashedButton =
  "w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40 mb-6";

interface MessageDesignerProps {
  guildId: string;
  value: DesignedMessage;
  onChange: (next: DesignedMessage) => void;
  savedEmbedId: string | null;
  onSavedEmbedChange: (id: string | null) => void;
  // Shows a "Reset to default design" link.
  onReset?: () => void;
  savedEmbedNote?: string;
  // Rendered at the bottom of the last card, e.g. a Save button.
  children?: React.ReactNode;
}

// The Embed Creator's editor, for a module that designs its own message:
// message text, up to 10 embeds (reorder by arrows or dragging), up to 5 rows
// of buttons and select menus, or a saved embed in place of all of it.
export function MessageDesigner({ guildId, value, onChange, savedEmbedId, onSavedEmbedChange, onReset, savedEmbedNote, children }: MessageDesignerProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const patch = (next: Partial<DesignedMessage>) => onChange({ ...value, ...next });

  function duplicateEmbed(id: string) {
    if (value.embeds.length >= 10) return;
    const i = value.embeds.findIndex((e) => e.id === id);
    const copy = { ...value.embeds[i], id: uid("e"), fields: value.embeds[i].fields.map((f) => ({ ...f })) };
    patch({ embeds: [...value.embeds.slice(0, i + 1), copy, ...value.embeds.slice(i + 1)] });
  }
  function removeEmbed(id: string) {
    const embeds = value.embeds.filter((e) => e.id !== id);
    patch({ embeds: embeds.length ? embeds : [emptyEmbed()] });
  }
  function moveEmbed(from: number, to: number) {
    if (to < 0 || to >= value.embeds.length || from === to) return;
    const embeds = [...value.embeds];
    const [moved] = embeds.splice(from, 1);
    embeds.splice(to, 0, moved);
    patch({ embeds });
  }

  return (
    <>
      <NeonCard className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium">Message</p>
          <span className="text-[11px] text-slate-600 font-mono">{value.content.length}/2000</span>
        </div>
        <MentionTextarea
          guildId={guildId}
          value={value.content}
          onChange={(v) => patch({ content: v })}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20"
          maxLength={2000}
          placeholder="Optional text above the embed(s)"
        />
      </NeonCard>

      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-sm">Embeds ({value.embeds.length}/10)</p>
        {onReset && (
          <button type="button" onClick={onReset} className="text-[11px] text-slate-500 hover:text-neon-blue">
            Reset to default design
          </button>
        )}
      </div>
      {value.embeds.map((em, i) => (
        <EmbedCard
          key={em.id}
          guildId={guildId}
          embed={em}
          index={i}
          onChange={(next) => patch({ embeds: value.embeds.map((e) => (e.id === em.id ? next : e)) })}
          onDuplicate={() => duplicateEmbed(em.id)}
          onRemove={() => removeEmbed(em.id)}
          onMoveUp={i > 0 ? () => moveEmbed(i, i - 1) : undefined}
          onMoveDown={i < value.embeds.length - 1 ? () => moveEmbed(i, i + 1) : undefined}
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
      <button type="button" onClick={() => value.embeds.length < 10 && patch({ embeds: [...value.embeds, emptyEmbed()] })} disabled={value.embeds.length >= 10} className={dashedButton}>
        + Add Embed
      </button>

      <p className="font-medium text-sm mb-3">Buttons &amp; Select Menus ({value.components.length}/5 rows)</p>
      {value.components.map((row, i) => (
        <ComponentRowEditor
          key={row.id}
          guildId={guildId}
          row={row}
          index={i}
          onChange={(next) => patch({ components: value.components.map((r) => (r.id === row.id ? next : r)) })}
          onRemove={() => patch({ components: value.components.filter((r) => r.id !== row.id) })}
        />
      ))}
      <button type="button" onClick={() => value.components.length < 5 && patch({ components: [...value.components, emptyRow()] })} disabled={value.components.length >= 5} className={dashedButton}>
        + Add Row
      </button>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Use a saved embed instead (optional)</label>
        <SavedEmbedPicker guildId={guildId} value={savedEmbedId} onChange={onSavedEmbedChange} />
        <p className="text-xs text-slate-600 mt-2">Picking one posts that saved embed in place of everything built above. {savedEmbedNote}</p>
        {children}
      </NeonCard>
    </>
  );
}
