"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { MessageSegmentBuilder, type SegmentToken } from "../../../../components/ui/MessageSegmentBuilder";
import { ModuleMessage, designFrom } from "../../../../components/embedCreator/ModuleMessage";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type WelcomeConfig, type WelcomeGreetingRow } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

const WELCOME_SEGMENT_TOKENS: SegmentToken[] = [
  { key: "user", label: "{user}" },
  { key: "server", label: "{server}" },
];

const TOKENS = [
  { token: "{user}", description: "Mentions the member" },
  { token: "{server}", description: "Your server's name" },
  { token: "{message}", description: "The greeting text above (or a random greeting)" },
  { token: "{avatar}", description: "The member's profile picture, for an image or thumbnail link" },
];
const AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

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
    const saved = await api.setWelcome(params.guildId, config);
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

  const fill = (text: string, user: string) => text.replace("{server}", "Your Server").replace("{user}", user);
  // What a welcome or goodbye looked like before anything was built here.
  const legacy = (kind: "welcome" | "goodbye") =>
    config.embedEnabled
      ? designFrom({
          title: config.embedTitle,
          description: "{message}",
          color: config.embedColor,
          extra: config.embedExtra,
          thumbnailUrl: kind === "welcome" ? "{avatar}" : null,
          links: config.buttons,
        })
      : designFrom({ content: "{message}", links: config.buttons });

  const testButton = (kind: "welcome" | "goodbye") => (
    <>
      <button type="button" onClick={() => sendTest(kind)} disabled={!config.channelId || testStatus?.state === "sending"} className="neon-button-sm disabled:opacity-40">
        {testStatus?.kind === kind && testStatus.state === "sending" ? "Sending…" : "Send Test"}
      </button>
      {testStatus?.kind === kind && testStatus.state === "sent" && <span className="text-xs text-emerald-400">✓ Sent, standing in for you.</span>}
      {testStatus?.kind === kind && testStatus.state === "error" && <span className="text-xs text-red-400">⚠ {testStatus.message}</span>}
    </>
  );

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
        {(["message", "greetings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2 text-sm border-b-2 transition-colors",
              tab === t ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {t === "message" ? "Message" : "Random Greetings"}
          </button>
        ))}
      </div>

      {tab === "greetings" && <GreetingsTab guildId={params.guildId} />}

      {tab === "message" && (
        <>
          <NeonCard className="mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Welcome Channel</label>
                <ChannelSelect guildId={params.guildId} value={config.channelId} onChange={(channelId) => setConfig({ ...config, channelId })} placeholder="Select a channel…" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Goodbye Channel (optional)</label>
                <ChannelSelect
                  guildId={params.guildId}
                  value={config.leaveChannelId ?? null}
                  onChange={(leaveChannelId) => setConfig({ ...config, leaveChannelId: leaveChannelId || null })}
                  placeholder="Same as the welcome channel"
                />
                <p className="text-xs text-slate-600 -mt-2">Pick a staff channel to keep goodbyes out of the public welcome channel.</p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Greeting Text</label>
                <MessageSegmentBuilder value={config.welcomeText} onChange={(next) => setConfig({ ...config, welcomeText: next })} tokens={WELCOME_SEGMENT_TOKENS} />
                <p className="text-xs text-slate-600 mt-1">
                  Shows wherever you put <code className="text-neon-blue">{"{message}"}</code> in the welcome message below. When the Random Greetings tab has
                  greetings turned on, one of those is used instead.
                </p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Goodbye Text</label>
                <MessageSegmentBuilder value={config.goodbyeText} onChange={(next) => setConfig({ ...config, goodbyeText: next })} tokens={WELCOME_SEGMENT_TOKENS} />
                <p className="text-xs text-slate-600 mt-1">
                  Shows wherever you put <code className="text-neon-blue">{"{message}"}</code> in the goodbye message below.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-base-950 px-3 py-2.5 mt-4">
              <div>
                <p className="text-sm font-medium">Also Ping Them Above the Message</p>
                <p className="text-xs text-slate-500">A mention inside an embed shows their name but doesn&apos;t notify them. On adds a ping above it so they get a notification.</p>
              </div>
              <ToggleSwitch enabled={config.pingAboveEmbed !== false} onChange={(v) => setConfig({ ...config, pingAboveEmbed: v })} label="Ping above the message" />
            </div>
            <div className="flex items-center mt-4">
              <button onClick={save} disabled={saving} className="neon-button">
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <SaveStatus status={autoSave} />
            </div>
          </NeonCard>

          <ModuleMessage
            guildId={params.guildId}
            title="Welcome message"
            description="Posted in the welcome channel when someone joins."
            ownerKey="welcome:join"
            savedEmbedId={config.savedEmbedId ?? null}
            onSavedEmbedChange={(id) => setConfig((c) => (c ? { ...c, savedEmbedId: id } : c))}
            seed={() => legacy("welcome")}
            tokens={TOKENS}
            tokenValues={{ "{user}": "<@0>", "{server}": "Your Server", "{message}": fill(config.welcomeText, "<@0>"), "{avatar}": AVATAR }}
          >
            {testButton("welcome")}
          </ModuleMessage>

          <ModuleMessage
            guildId={params.guildId}
            title="Goodbye message"
            description="Posted when someone leaves."
            ownerKey="welcome:leave"
            savedEmbedId={config.goodbyeSavedEmbedId ?? null}
            onSavedEmbedChange={(id) => setConfig((c) => (c ? { ...c, goodbyeSavedEmbedId: id } : c))}
            seed={() => legacy("goodbye")}
            tokens={TOKENS.filter((t) => t.token !== "{avatar}")}
            tokenValues={{ "{user}": "Draven", "{server}": "Your Server", "{message}": fill(config.goodbyeText, "Draven") }}
          >
            {testButton("goodbye")}
          </ModuleMessage>

          <p className="text-xs text-slate-500">
            💡 &quot;Send Test&quot; posts the real message using your own account in place of the member, so Discord only pings <em>you</em>. To test how an{" "}
            <code className="text-neon-blue">@role</code> mention notifies people, give yourself a small test role and mention that instead.
          </p>
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
        <code className="text-neon-blue">{"{server}"}</code> same as the Message tab. The picked greeting shows wherever the welcome message has{" "}
        <code className="text-neon-blue">{"{message}"}</code>.
      </p>

      {rows.length > 0 && (
        <p className="text-xs text-slate-500">
          {enabledCount === 0
            ? "All greetings here are disabled, so joins will fall back to the Greeting Text on the Message tab."
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
