"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { SaveStatus } from "../ui/SaveStatus";
import { DiscordButton, DiscordButtonRow } from "../ui/DiscordPreview";
import { MessageDesigner, TokenChips, toCreatorState, withTokens, type DesignedMessage } from "./MessageDesigner";
import { SavedEmbedPicker } from "./SavedEmbedPicker";
import { EmbedCreatorPreview } from "./EmbedCreatorPreview";
import { DiscordLimitsCard } from "./DiscordLimitsCard";
import { checkDiscordLimits } from "../../lib/discordLimits";
import { useAutoSave } from "../../lib/useAutoSave";
import { api, type EmbedCreatorEmbed } from "../../lib/api";

// The one message box every module uses for a message it posts.
//
// A switch at the top picks how the message is made:
// - Build here: the full Embed Creator editor (MessageDesigner), made just for
//   this module, with its own placeholders. What's built is saved as this
//   module's own saved embed (kept out of the library, keyed by `ownerKey`),
//   and the module's savedEmbedId points at it.
// - Use a saved embed: hides the editor; pick any embed from the library.
//
// Either way the module posts through the bot's one saved-embed renderer, so
// a change to the editor or the renderer reaches every module at once.
// Switching back and forth never loses what was built.
//
// Modules that keep their own copy of the message (Honeypot, daily posts,
// announcements) pass `inline` instead, and save it with the rest of the page.

export interface ModuleMessageProps {
  guildId: string;
  // Heading and when it posts, e.g. "Welcome message" / "Posted when someone joins."
  title: string;
  description?: string;
  // Unique per message: "welcome:join", "ticketPanel:<id>".
  ownerKey: string;
  savedEmbedId: string | null;
  onSavedEmbedChange: (id: string | null) => void;
  // How the message looks before anything is built here (today's settings, or the module's default).
  seed: () => DesignedMessage;
  tokens?: Array<{ token: string; description: string }>;
  // Example values for the preview, e.g. {"{user}": "@NewMember"}.
  tokenValues?: Record<string, string>;
  // Buttons the module adds under the message itself (Verify, I Agree…).
  moduleButtons?: string[];
  // How many rows of its own buttons the module adds (defaults to 1 when moduleButtons is set).
  reservedRows?: number;
  note?: string;
  // Panels that only post the embeds (with the module's own buttons under them).
  embedsOnly?: boolean;
  inline?: { value: DesignedMessage; onChange: (next: DesignedMessage) => void };
  children?: React.ReactNode;
}

type Mode = "build" | "saved";
const pick = (d: Partial<DesignedMessage> | undefined): DesignedMessage => ({ content: d?.content ?? "", embeds: d?.embeds ?? [], components: d?.components ?? [] });

let seq = 0;
const id = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// A starting design from a module's simple settings (what it posted before
// anything was built here), so switching to the new editor changes nothing.
export function designFrom(opts: {
  content?: string | null;
  title?: string | null;
  description?: string | null;
  color?: string | null;
  footer?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  // The old "more embed options" block: author, images, footer icon, timestamp, fields.
  extra?: Partial<Omit<EmbedCreatorEmbed, "id" | "fields">> & { fields?: Array<{ name: string; value: string; inline?: boolean }> } | null;
  // Old link buttons.
  links?: Array<{ label: string; url: string }> | null;
}): DesignedMessage {
  const { fields, ...extra } = opts.extra ?? {};
  const embed: EmbedCreatorEmbed = { id: id("e"), color: opts.color || "#7B99BC", ...extra, fields: (fields ?? []).map((f) => ({ name: f.name, value: f.value, inline: !!f.inline })) };
  if (opts.title) embed.title = opts.title;
  if (opts.description) embed.description = opts.description;
  if (opts.footer) embed.footerText = opts.footer;
  if (opts.imageUrl) embed.imageUrl = opts.imageUrl;
  if (opts.thumbnailUrl && !embed.thumbnailUrl) embed.thumbnailUrl = opts.thumbnailUrl;
  const hasEmbed = !!(embed.title || embed.description || embed.footerText || embed.imageUrl || embed.thumbnailUrl || embed.authorName || embed.fields.length);
  const links = (opts.links ?? []).filter((b) => b?.url);
  const components: DesignedMessage["components"] = links.length
    ? [{ id: id("r"), type: "buttons", items: links.slice(0, 5).map((b) => ({ id: id("b"), kind: "link", label: b.label || "Link", url: b.url })) }]
    : [];
  return { content: opts.content ?? "", embeds: hasEmbed ? [embed] : [], components };
}

export function ModuleMessage(props: ModuleMessageProps) {
  const { guildId, title, description, ownerKey, savedEmbedId, onSavedEmbedChange, seed, tokens, tokenValues, moduleButtons, reservedRows, note, embedsOnly, inline, children } = props;
  const [loaded, setLoaded] = useState(!!inline);
  const [mode, setMode] = useState<Mode>(inline && savedEmbedId ? "saved" : "build");
  const [ownId, setOwnId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DesignedMessage | null>(null);
  const [libraryData, setLibraryData] = useState<DesignedMessage | null>(null);
  const [libraryMissing, setLibraryMissing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const savedRef = useRef(savedEmbedId);
  savedRef.current = savedEmbedId;

  // Find this module's own embed and what it points at now.
  useEffect(() => {
    if (inline) return;
    let live = true;
    setLoaded(false);
    api
      .getModuleEmbed(guildId, ownerKey, savedRef.current)
      .then(({ own, current }) => {
        if (!live) return;
        setOwnId(own?.id ?? null);
        setDraft(own ? pick(own.data) : seedRef.current());
        setMode(savedRef.current && current && !current.ownerKey ? "saved" : savedRef.current && !current ? "saved" : "build");
        setLoaded(true);
      })
      .catch(() => {
        if (!live) return;
        setDraft(seedRef.current());
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [guildId, ownerKey, inline]);

  // The library embed being used, for the preview.
  const libraryId = mode === "saved" && savedEmbedId && savedEmbedId !== ownId ? savedEmbedId : null;
  useEffect(() => {
    setLibraryData(null);
    setLibraryMissing(false);
    if (!libraryId) return;
    api
      .getEmbedCreatorPreset(guildId, libraryId)
      .then((p) => setLibraryData(pick(p.data)))
      .catch(() => setLibraryMissing(true));
  }, [guildId, libraryId]);

  const value = inline ? inline.value : draft;
  const setValue = (next: DesignedMessage) => (inline ? inline.onChange(next) : setDraft(next));

  // Build here saves by itself a moment after each change.
  const status = useAutoSave(inline || !loaded ? null : draft, async () => {
    if (!draft) return;
    const row = await api.saveModuleEmbed(guildId, ownerKey, draft, ownId ?? undefined);
    setOwnId(row.id);
    if (savedRef.current !== row.id) onSavedEmbedChange(row.id);
  }, 900, ownerKey);

  function choose(next: Mode) {
    if (next === mode) return;
    setMode(next);
    // Build here posts what's built here again (or the module's own settings if nothing's been built yet).
    if (next === "build") onSavedEmbedChange(inline ? null : ownId);
  }

  const shown = mode === "build" ? value : libraryData;
  const state = useMemo(() => (shown ? toCreatorState(embedsOnly ? { ...shown, content: "", components: [] } : shown) : null), [shown, embedsOnly]);
  // The module adds its own button row(s) under the message, and Discord allows 5 rows in all.
  const reserved = reservedRows ?? (moduleButtons?.length ? 1 : 0);
  const limits = useMemo(() => {
    if (mode !== "build" || !state) return null;
    const report = checkDiscordLimits(state);
    const rows = state.components.filter((r) => r.type).length;
    if (reserved && rows + reserved > 5) {
      report.issues.push({ level: "error", message: `This module adds ${reserved} row${reserved > 1 ? "s" : ""} of its own buttons, so you can use ${5 - reserved} at most. You have ${rows}.` });
      report.hasErrors = true;
    }
    return report;
  }, [mode, state, reserved]);

  async function toLibrary() {
    if (!value) return;
    try {
      const row = await api.copyModuleEmbedToLibrary(guildId, title, value);
      setFlash(`Saved to your library as “${row.name}”. Any module can use it now.`);
    } catch {
      setFlash("Couldn't save it to the library. Try again.");
    }
    setTimeout(() => setFlash(null), 5000);
  }

  const extra = moduleButtons?.length ? (
    <div className="mt-2">
      <DiscordButtonRow>
        {moduleButtons.map((label, i) => (
          <DiscordButton key={label + i} label={label} style={i === 0 ? "primary" : "secondary"} />
        ))}
      </DiscordButtonRow>
    </div>
  ) : undefined;

  const tab = (m: Mode, label: string) => (
    <button type="button" aria-pressed={mode === m} onClick={() => choose(m)} className={`sp-metal px-3.5 py-2 rounded-lg text-sm font-semibold ${mode === m ? "is-active" : ""}`}>
      {label}
    </button>
  );

  return (
    <section className="mb-6" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        <div className="flex gap-1.5 p-1 rounded-xl border border-white/10 bg-base-950/60" role="group" aria-label={`How to make the ${title.toLowerCase()}`}>
          {tab("build", "🧱 Build here")}
          {tab("saved", "📚 Use a saved embed")}
        </div>
      </div>

      {!loaded || !value ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,1fr)] gap-5 items-start">
          <div className="min-w-0">
            {mode === "build" ? (
              <>
                {tokens && tokens.length > 0 && <TokenChips tokens={tokens} note={note} />}
                <MessageDesigner
                  guildId={guildId}
                  value={value}
                  onChange={setValue}
                  savedEmbedId={null}
                  onSavedEmbedChange={() => undefined}
                  onReset={() => setValue(seedRef.current())}
                  hideSavedPicker
                  embedsOnly={embedsOnly}
                >
                  <NeonCard>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button type="button" onClick={() => void toLibrary()} className="text-xs font-semibold text-neon-blue hover:underline">
                        Save this to my library
                      </button>
                      {!inline && <SaveStatus status={status} />}
                      {children}
                    </div>
                    {flash && <p className="text-xs text-slate-400 mt-2">{flash}</p>}
                    {!inline && <p className="text-xs text-slate-600 mt-2">Changes save by themselves.</p>}
                  </NeonCard>
                </MessageDesigner>
              </>
            ) : (
              <NeonCard>
                <SavedEmbedPicker
                  guildId={guildId}
                  value={libraryId}
                  onChange={(next) => onSavedEmbedChange(next ?? (inline ? null : ownId))}
                  bare
                  noneLabel="Pick one…"
                />
                <p className="text-xs text-slate-500 mt-3">
                  The editor is hidden while this is on. {tokens?.length ? `Placeholders like ${tokens[0].token} still work inside a saved embed. ` : ""}
                  {moduleButtons?.length ? "This module's own buttons are still added under it. " : ""}
                  {!libraryId && "Until you pick one, the message you built keeps posting."}
                </p>
                {libraryMissing && <p className="text-xs text-rose-400 mt-2">That saved embed was deleted. Pick another one.</p>}
                <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-dashed border-white/10">Your built message is kept. Switch back to Build here any time.</p>
                {children && <div className="mt-3">{children}</div>}
              </NeonCard>
            )}
          </div>

          <div className="min-w-0 space-y-4 xl:sticky xl:top-4">
            <NeonCard>
              <p className="font-medium mb-3">Preview in Discord</p>
              {state ? (
                <EmbedCreatorPreview guildId={guildId} state={tokenValues ? withTokens(state, tokenValues) : state} extra={extra} />
              ) : (
                <p className="text-xs text-slate-600 text-center py-8">Pick a saved embed to see it here.</p>
              )}
            </NeonCard>
            {limits && <DiscordLimitsCard report={limits} />}
          </div>
        </div>
      )}
    </section>
  );
}
