"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { MessageSegmentBuilder, type SegmentToken } from "../../../../components/ui/MessageSegmentBuilder";
import { EMPTY_EMBED_EXTRA } from "../../../../lib/embedExtra";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type WelcomeConfig, type WelcomeGreetingRow } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

const WELCOME_SEGMENT_TOKENS: SegmentToken[] = [
  { key: "user", label: "{user}" },
  { key: "server", label: "{server}" },
];

const COLOR_PRESETS = ["#00E5FF", "#5865F2", "#7CB88F", "#D8AE6B", "#C77B7B", "#B98AD1"];

type Tab = "message" | "greetings";

export default function WelcomePage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("message");
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<{ kind: "welcome" | "goodbye"; state: "sending" | "sent" | "error"; message?: string } | null>(null);

  useEffect(() => {
    api.getWelcome(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    // savedEmbedId has no UI on this page anymore (the inline embed builder
    // below replaces it) — clearing it here migrates any older guild that
    // still had one set off it, so the inline fields above actually apply.
    const saved = await api.setWelcome(params.guildId, { ...config, savedEmbedId: null });
    setConfig(saved);
    setSaving(false);
  }

  const autoSave = useAutoSave(config, save);

  async function sendTest(kind: "welcome" | "goodbye") {
    setTestStatus({ kind, state: "sending" });
    try {
      await api.sendWelcomeTest(params.guildId, kind);
      setTestStatus({ kind, state: "sent" });
    } catch (e) {
      setTestStatus({ kind, state: "error", message: e instanceof Error ? e.message : "Failed to send." });
    }
    setTimeout(() => setTestStatus(null), 4000);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  const previewText = config.welcomeText.replace("{server}", "Iron Legion").replace("{user}", "@Draven");
  const goodbyePreviewText = config.goodbyeText.replace("{server}", "Iron Legion").replace("{user}", "Draven");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="WELCOME"
        title="Welcome & Goodbye"
        description={
          <>
            Use <code className="text-neon-blue">{"{user}"}</code> and{" "}
            <code className="text-neon-blue">{"{server}"}</code> as placeholders.
          </>
        }
      />

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("message")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "message" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Message
        </button>
        <button
          onClick={() => setTab("greetings")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "greetings" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Random Greetings
        </button>
      </div>

      {tab === "greetings" && <GreetingsTab guildId={params.guildId} />}

      {tab === "message" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Welcome Channel</label>
          <ChannelSelect
            guildId={params.guildId}
            value={config.channelId}
            onChange={(channelId) => setConfig({ ...config, channelId })}
            placeholder="Select a channel…"
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Welcome Message</label>
          <p className="text-xs text-slate-600 mb-2">
            Used on join whenever the Random Greetings tab has no enabled greetings — add one or more there to have the bot pick a different message (and
            show a wave button) each time instead of always using this one.
          </p>
          <MessageSegmentBuilder
            value={config.welcomeText}
            onChange={(next) => setConfig({ ...config, welcomeText: next })}
            tokens={WELCOME_SEGMENT_TOKENS}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Goodbye Message</label>
          <MessageSegmentBuilder
            value={config.goodbyeText}
            onChange={(next) => setConfig({ ...config, goodbyeText: next })}
            tokens={WELCOME_SEGMENT_TOKENS}
          />

          <div className="flex items-center justify-between mb-3 rounded-lg border border-white/10 bg-base-950 px-3 py-2.5 mt-4">
            <div>
              <p className="text-sm font-medium">Send as Embed</p>
              <p className="text-xs text-slate-500">
                One or the other, never both — off sends the plain text above, on wraps it in a colored embed card instead. Shared by both Welcome and
                Goodbye.
              </p>
            </div>
            <ToggleSwitch enabled={config.embedEnabled} onChange={(v) => setConfig({ ...config, embedEnabled: v })} label="Send as embed" />
          </div>

          {config.embedEnabled && (
            <>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title (optional)</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                value={config.embedTitle ?? ""}
                onChange={(e) => setConfig({ ...config, embedTitle: e.target.value })}
                placeholder="👋 Welcome!"
              />

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  className="h-9 w-11 rounded-lg border border-white/10 bg-base-950 cursor-pointer shrink-0"
                  value={config.embedColor}
                  onChange={(e) => setConfig({ ...config, embedColor: e.target.value })}
                />
                <input
                  className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                  value={config.embedColor}
                  onChange={(e) => setConfig({ ...config, embedColor: e.target.value })}
                />
              </div>
              <div className="flex gap-1.5 mb-4">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setConfig({ ...config, embedColor: c })}
                    className="w-[18px] h-[18px] rounded border border-white/10 hover:scale-110 transition-transform"
                    style={{ background: c }}
                  />
                ))}
              </div>

              <EmbedExtraFields
                guildId={params.guildId}
                value={config.embedExtra ?? EMPTY_EMBED_EXTRA}
                onChange={(v) => setConfig({ ...config, embedExtra: v })}
              />
            </>
          )}
        </NeonCard>

        <div className="space-y-4">
          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Live Preview (Welcome)</p>
              <button onClick={() => sendTest("welcome")} disabled={!config.channelId || testStatus?.state === "sending"} className="neon-button-sm disabled:opacity-40">
                {testStatus?.kind === "welcome" && testStatus.state === "sending" ? "Sending…" : "Send Test"}
              </button>
            </div>
            <StickyPreview
              content={config.embedEnabled ? "" : previewText}
              embedEnabled={config.embedEnabled}
              embedTitle={config.embedTitle ?? ""}
              embedDescription={previewText}
              embedColor={config.embedColor}
              buttons={[]}
              embedExtra={config.embedExtra ?? {}}
            />
            {testStatus?.kind === "welcome" && testStatus.state === "sent" && (
              <p className="text-xs text-emerald-400 mt-2">✓ Sent to the welcome channel, standing in for you.</p>
            )}
            {testStatus?.kind === "welcome" && testStatus.state === "error" && <p className="text-xs text-red-400 mt-2">⚠ {testStatus.message}</p>}
          </NeonCard>

          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Live Preview (Goodbye)</p>
              <button onClick={() => sendTest("goodbye")} disabled={!config.channelId || testStatus?.state === "sending"} className="neon-button-sm disabled:opacity-40">
                {testStatus?.kind === "goodbye" && testStatus.state === "sending" ? "Sending…" : "Send Test"}
              </button>
            </div>
            <StickyPreview
              content={config.embedEnabled ? "" : goodbyePreviewText}
              embedEnabled={config.embedEnabled}
              embedTitle={config.embedTitle ?? ""}
              embedDescription={goodbyePreviewText}
              embedColor={config.embedColor}
              buttons={[]}
              embedExtra={config.embedExtra ?? {}}
            />
            {testStatus?.kind === "goodbye" && testStatus.state === "sent" && (
              <p className="text-xs text-emerald-400 mt-2">✓ Sent to the welcome channel, standing in for you.</p>
            )}
            {testStatus?.kind === "goodbye" && testStatus.state === "error" && <p className="text-xs text-red-400 mt-2">⚠ {testStatus.message}</p>}
          </NeonCard>

          <p className="text-xs text-slate-500">
            💡 "Send Test" posts the real message to your welcome channel using your own account in place of the new member, so you can see
            exactly how it looks — but Discord only pings <em>you</em>, not a stranger. If you want to test how an{" "}
            <code className="text-neon-blue">@role</code> mention in your message notifies people, create a small test role, give it to
            yourself (and anyone else helping test), and mention that role instead of a real staff role while you're testing.
          </p>
        </div>
      </div>
      )}

      {tab === "message" && (
        <>
          <button onClick={save} disabled={saving} className="neon-button mt-4">
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <SaveStatus status={autoSave} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Random Greetings — a pool of alternate join messages, each with its own
// wave button, picked at random per join.
// ---------------------------------------------------------------------------

const EMPTY_GREETING = { text: "Welcome to {server}, {user}!", buttonLabel: "👋 Wave to say hi!" };

// Starting points, not a fixed library — each is added exactly as shown and
// then fully editable like any other greeting. Covers a spread of tones
// (plain, hype, chill, meme-y) so there's something close to every server's
// voice to tweak rather than write from a blank box.
const GREETING_SUGGESTIONS: Array<{ text: string; buttonLabel: string }> = [
  { text: "Welcome to {server}, {user}! 🎉", buttonLabel: "👋 Wave to say hi!" },
  { text: "{user} just landed in {server}. Make some noise!", buttonLabel: "📣 Hype them up" },
  { text: "Everyone welcome {user} to {server} — glad you're here!", buttonLabel: "🤝 Say welcome" },
  { text: "🚪 {user} walked into {server}... no cake, sorry.", buttonLabel: "🎂 Offer sympathy" },
  { text: "A wild {user} appeared in {server}!", buttonLabel: "⚔️ Challenge them" },
  { text: "{user}, welcome aboard {server}. Grab a seat and get comfy.", buttonLabel: "🛋️ Pull up a chair" },
];

function GreetingsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<WelcomeGreetingRow[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  function refresh() {
    api.getWelcomeGreetings(guildId).then(setRows);
  }
  useEffect(refresh, [guildId]);

  async function add(preset?: { text: string; buttonLabel: string }) {
    setAdding(preset?.text ?? "blank");
    await api.addWelcomeGreeting(guildId, preset ?? EMPTY_GREETING);
    setAdding(null);
    refresh();
  }

  async function update(row: WelcomeGreetingRow, patch: Partial<WelcomeGreetingRow>) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    await api.updateWelcomeGreeting(guildId, row.id, patch);
  }

  async function remove(row: WelcomeGreetingRow) {
    if (!(await confirm("Delete this greeting?"))) return;
    await api.deleteWelcomeGreeting(guildId, row.id);
    refresh();
  }

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-400">
        Add a few different greetings and the bot picks one at random each time someone joins — each gets its own button another member can click to
        publicly wave hello to the new member. Use <code className="text-neon-blue">{"{user}"}</code> and{" "}
        <code className="text-neon-blue">{"{server}"}</code> same as the Message tab.
      </p>

      {rows.length > 0 && (
        <p className="text-xs text-slate-500">
          {enabledCount === 0
            ? "All greetings here are disabled, so joins will fall back to the single Welcome Message on the Message tab."
            : `${enabledCount} of ${rows.length} enabled — one is picked at random on each join.`}
        </p>
      )}

      <NeonCard className="!p-3.5">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Suggestions — click to add, then edit as you like</p>
        <div className="flex flex-wrap gap-1.5">
          {GREETING_SUGGESTIONS.map((s) => (
            <button
              key={s.text}
              onClick={() => add(s)}
              disabled={adding !== null}
              title={s.text}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-base-950 border border-white/10 text-slate-300 hover:border-neon-blue/40 hover:text-neon-blue disabled:opacity-50 max-w-[220px] truncate"
            >
              {adding === s.text ? "Adding…" : s.text}
            </button>
          ))}
        </div>
      </NeonCard>

      <div className="space-y-2.5">
        {rows.map((row) => (
          <NeonCard key={row.id}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <textarea
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                  rows={2}
                  value={row.text}
                  onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, text: e.target.value } : r)))}
                  onBlur={() => update(row, { text: row.text })}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 shrink-0">Button:</span>
                  <input
                    className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                    value={row.buttonLabel}
                    onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, buttonLabel: e.target.value } : r)))}
                    onBlur={() => update(row, { buttonLabel: row.buttonLabel })}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <ToggleSwitch enabled={row.enabled} onChange={(v) => update(row, { enabled: v })} label="Enabled" />
                <button onClick={() => remove(row)} className="text-xs text-slate-500 hover:text-rose-400">
                  Remove
                </button>
              </div>
            </div>
          </NeonCard>
        ))}
      </div>

      <button onClick={() => add()} disabled={adding !== null} className="neon-button-sm disabled:opacity-50">
        {adding === "blank" ? "Adding…" : "+ Add blank greeting"}
      </button>
    </div>
  );
}
