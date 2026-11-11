"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACTIONS,
  ACTION_BY_ID,
  ACTION_GROUPS,
  COMMAND_ACCESS,
  INPUT_TYPES,
  MODULE_KEYS,
  MODULE_LABELS,
  PERMISSIONS,
  type ActionParam,
  type CommandAccess,
  type CommandDraft,
  type CommandInput,
  type CommandStep,
  type InputType,
} from "@spartacus/shared";
import { api, type CustomCommandRunRow, type CustomSlashCommandRow } from "../../lib/api";
import { NeonCard } from "../ui/NeonCard";
import { ChannelSelect } from "../ui/ChannelSelect";
import { RoleSelect } from "../ui/RoleSelect";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { FormError } from "../ui/FormError";
import { useConfirm } from "../ui/ConfirmDialog";

// Custom Commands → Slash commands: build a /command from steps, try the
// catalog, and read the Command Log. The actions come from
// packages/shared/commandBuilder.ts, which the bot runs.

const field = "w-full bg-base-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm";
const BLANK: CommandDraft = { name: "", description: "", enabled: true, access: "EVERYONE", roleIds: [], channelIds: [], cooldownSec: 0, checkPerms: true, skipConfirm: false, inputs: [], steps: [], reply: "✅ Done!", replyPublic: false, logChannelId: null };
const inp = (name: string, type: InputType, description: string, required = true): CommandInput => ({ name, type, description, required, choices: [] });
const step = (action: string, params: Record<string, string>): CommandStep => ({ action, params });

const TEMPLATES: Array<{ label: string; draft: Partial<CommandDraft> }> = [
  {
    label: "/mute",
    draft: { name: "mute", description: "Timeout a member and let them know", access: "MODS", inputs: [inp("member", "member", "Who to mute"), inp("minutes", "number", "How many minutes"), inp("reason", "text", "Why", false)], steps: [step("timeout", { user: "{member}", for: "{minutes}m", reason: "{reason}" }), step("dm", { user: "{member}", text: "You were muted in {server} for {minutes} minutes. {reason}" })], reply: "🔇 {member} is muted for {minutes} minutes." },
  },
  {
    label: "/squad",
    draft: { name: "squad", description: "Make a private voice channel for your squad", inputs: [inp("name", "text", "Channel name")], cooldownSec: 300, checkPerms: false, steps: [step("create_voice", { name: "🎮 {name}", category: "", limit: "5", private: "Yes" }), step("move_voice", { user: "{me}", voice: "{new_channel}" })], reply: "🎮 Made {new_channel}. Invite your squad!" },
  },
  {
    label: "/lockdown",
    draft: { name: "lockdown", description: "Lock the server down during a raid", access: "MODS", inputs: [inp("reason", "text", "Why", false)], steps: [step("lockdown", {}), step("send_message", { channel: "", text: "🔒 The server is locked down for now. {reason}" })], reply: "🔒 Locked down." },
  },
  {
    label: "/add-game",
    draft: { name: "add-game", description: "Add a game role, channel and onboarding answer", access: "ADMINS", inputs: [inp("game", "text", "Game name")], steps: [step("create_role", { name: "{game}", color: "", hoist: "No", mentionable: "Yes" }), step("create_text", { name: "{game}", category: "", topic: "Talk about {game}", private: "No" }), step("onb_answer", { question: "What do you play?", answer: "{game}", role: "{new_role}", channel: "{new_channel}", emoji: "" })], reply: "✅ {game} has a role, a channel and an onboarding answer." },
  },
  {
    label: "/getrole",
    draft: { name: "getrole", description: "Toggle a fun role on yourself", checkPerms: false, inputs: [], steps: [step("toggle_role", { user: "", role: "" })], reply: "Done! Run it again to take it off." },
  },
];

// ---- One field of a step ----
function TokenSelect({ value, onChange, tokens, children }: { value: string; onChange: (v: string) => void; tokens: Array<[string, string]>; children?: React.ReactNode }) {
  const isToken = value.startsWith("{") || value === "";
  return (
    <div className="space-y-1">
      <select className={field} value={isToken ? value : "__pick"} onChange={(e) => onChange(e.target.value === "__pick" ? " " : e.target.value)}>
        {tokens.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        {children && <option value="__pick">Pick a specific one…</option>}
      </select>
      {!isToken && children}
    </div>
  );
}

function Perms({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const map = Object.fromEntries(value.split(",").filter(Boolean).map((x) => x.split(":")));
  const set = (k: string, v: string) => {
    const next = { ...map, [k]: v };
    if (!v) delete next[k];
    onChange(Object.entries(next).map(([a, b]) => `${a}:${b}`).join(","));
  };
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {PERMISSIONS.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2 rounded-md bg-base-950 px-2 py-1 text-xs">
          <span className="truncate text-slate-300">{k.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
          <span className="flex shrink-0 gap-1">
            {[["", "–"], ["allow", "✓"], ["deny", "✕"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set(k, v)} className={`h-5 w-6 rounded ${(map[k] ?? "") === v ? (v === "allow" ? "bg-emerald-500/30 text-emerald-300" : v === "deny" ? "bg-rose-500/30 text-rose-300" : "bg-white/10 text-white") : "text-slate-500 hover:bg-white/5"}`}>
                {l}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function ParamField({ guildId, p, value, onChange, inputs }: { guildId: string; p: ActionParam; value: string; onChange: (v: string) => void; inputs: CommandInput[] }) {
  const of = (t: InputType) => inputs.filter((i) => i.type === t).map((i) => [`{${i.name}}`, `“${i.name}” (what they type)`] as [string, string]);
  const label = (
    <span className="mb-0.5 block text-[11px] text-slate-400">
      {p.label}
      {p.req ? " *" : ""}
      {p.hint ? <span className="text-slate-600"> · {p.hint}</span> : null}
    </span>
  );
  let control: React.ReactNode;
  switch (p.type) {
    case "longtext":
      control = <textarea className={`${field} min-h-16`} value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      control = (
        <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
          {p.k === "key" ? <option value="">Pick a module</option> : null}
          {(p.k === "key" ? MODULE_KEYS.map((k) => k as string) : p.opts ?? []).map((o) => (
            <option key={o} value={o}>
              {p.k === "key" ? MODULE_LABELS[o as keyof typeof MODULE_LABELS] : o}
            </option>
          ))}
        </select>
      );
      break;
    case "color":
      control = (
        <div className="flex gap-2">
          <input type="color" className="h-8 w-10 rounded bg-transparent" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#5865f2"} onChange={(e) => onChange(e.target.value)} />
          <input className={field} value={value} placeholder="#5865F2 or {input}" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
      break;
    case "channel":
    case "anychannel":
    case "voice":
    case "category": {
      const kind = p.type === "voice" ? "voice" : p.type === "category" ? "category" : "text";
      const tokens: Array<[string, string]> = [
        ["", p.type === "channel" ? "Where the command was used" : p.req ? "Choose…" : "None"],
        ...(p.type !== "category" ? ([["{new_channel}", "The channel made in an earlier step"]] as Array<[string, string]>) : ([["{new_category}", "The category made in an earlier step"]] as Array<[string, string]>)),
        ...of("channel"),
      ];
      control = (
        <TokenSelect value={value} onChange={onChange} tokens={tokens}>
          <ChannelSelect guildId={guildId} kind={kind} value={value.trim() || null} onChange={(id) => onChange(id || "")} />
        </TokenSelect>
      );
      break;
    }
    case "role":
      control = (
        <TokenSelect value={value} onChange={onChange} tokens={[["", p.req ? "Choose…" : "None"], ["{new_role}", "The role made in an earlier step"], ...of("role")]}>
          <RoleSelect guildId={guildId} value={value.trim() || null} onChange={(id) => onChange(id || "")} />
        </TokenSelect>
      );
      break;
    case "roles": {
      const list = value.split(",").filter(Boolean);
      control = (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {list.map((r) => (
              <span key={r} className="rounded-full bg-white/5 px-2 py-0.5 text-xs">
                {r.startsWith("{") ? r : `role ${r.slice(-4)}`}{" "}
                <button type="button" className="text-rose-400" onClick={() => onChange(list.filter((x) => x !== r).join(","))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <RoleSelect guildId={guildId} value={null} onChange={(id) => id && !list.includes(id) && onChange([...list, id].join(","))} placeholder="Add a role" />
        </div>
      );
      break;
    }
    case "user":
      control = (
        <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{p.req ? "Choose…" : "Whoever ran it"}</option>
          <option value="{me}">Whoever ran it</option>
          {of("member").map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      );
      break;
    case "perms":
      control = <Perms value={value} onChange={onChange} />;
      break;
    default:
      control = <input className={field} value={value} placeholder={p.type === "duration" ? "10m, 2h, 1d or {input}" : p.type === "message" ? "Message link (blank: the last one this command posted)" : p.type === "userid" ? "User ID or {input}" : "Type, or use {input}"} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label className={`block ${p.type === "perms" || p.type === "longtext" ? "sm:col-span-2" : ""}`}>
      {label}
      {control}
    </label>
  );
}

// ---- The editor ----
// Kept outside Editor so typing in a field doesn't remount it (and lose focus).
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3 rounded-xl border border-white/10 p-3">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-neon-blue/15 text-xs font-bold text-neon-blue">{n}</span>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

function Editor({ guildId, start, onDone, onCancel }: { guildId: string; start: CommandDraft & { id?: string }; onDone: () => void; onCancel: () => void }) {
  const [d, setD] = useState<CommandDraft>(start);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<CommandDraft>) => setD((x) => ({ ...x, ...patch }));
  const risky = d.steps.some((s) => ACTION_BY_ID[s.action]?.risky);
  const tokens = ["{me}", "{server}", "{channel}", "{new_channel}", "{new_role}", ...d.inputs.map((i) => `{${i.name}}`)];
  const setStep = (i: number, patch: Record<string, string>) => set({ steps: d.steps.map((s, k) => (k === i ? { ...s, params: { ...s.params, ...patch } } : s)) });
  const move = (i: number, by: number) => {
    const next = [...d.steps];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x);
    set({ steps: next });
  };
  const shown = ACTIONS.filter((a) => !q || `${a.name} ${a.desc}`.toLowerCase().includes(q.toLowerCase()));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (start.id) await api.updateCustomSlashCommand(guildId, start.id, d);
      else await api.createCustomSlashCommand(guildId, d);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <NeonCard>
      <p className="mb-3 font-medium">{start.id ? `Edit /${start.name}` : "New slash command"}</p>
      {!start.id && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Start from:</span>
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" className="rounded-lg border border-white/10 px-2.5 py-1 hover:border-neon-blue/50" onClick={() => setD({ ...BLANK, ...t.draft })}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <Section n={1} title="Name it">
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <span className="font-bold text-neon-blue">/</span>
              <input className={`${field} w-44 font-mono`} value={d.name} maxLength={32} placeholder="my-command" onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
            </div>
            <input className={`${field} min-w-[200px] flex-1`} value={d.description} maxLength={100} placeholder="What it does (Discord shows this)" onChange={(e) => set({ description: e.target.value })} />
          </div>
        </Section>

        <Section n={2} title="Who can use it">
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(COMMAND_ACCESS) as Array<[CommandAccess, string]>).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set({ access: k })} className={`rounded-lg border px-3 py-1.5 text-sm ${d.access === k ? "border-neon-blue bg-neon-blue/10 text-neon-blue" : "border-white/10 text-slate-300"}`}>
                {l}
              </button>
            ))}
          </div>
          {d.access === "ROLES" && (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {d.roleIds.map((r) => (
                  <span key={r} className="rounded-full bg-white/5 px-2 py-0.5 text-xs">
                    role …{r.slice(-4)}{" "}
                    <button type="button" className="text-rose-400" onClick={() => set({ roleIds: d.roleIds.filter((x) => x !== r) })}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <RoleSelect guildId={guildId} value={null} onChange={(id) => id && !d.roleIds.includes(id) && set({ roleIds: [...d.roleIds, id] })} placeholder="Add a role that can use it" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Only in this channel (optional)
              <ChannelSelect guildId={guildId} value={d.channelIds[0] ?? null} onChange={(id) => set({ channelIds: id ? [id] : [] })} placeholder="Anywhere" />
            </label>
            <label className="text-xs text-slate-400">
              Cooldown per person (seconds, 0 = none)
              <input type="number" min={0} className={field} value={d.cooldownSec} onChange={(e) => set({ cooldownSec: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          </div>
          <label className="flex items-start justify-between gap-3 text-sm">
            <span>
              They need each step's Discord permission
              <span className="block text-xs text-slate-500">Turn off to let members use it for things they normally can't (like /squad making a channel). Who can use it still applies.</span>
            </span>
            <ToggleSwitch enabled={d.checkPerms} onChange={(checkPerms) => set({ checkPerms })} />
          </label>
          {risky && (
            <label className="flex items-start justify-between gap-3 text-sm">
              <span>
                Skip “Yes, do it”
                <span className="block text-xs text-amber-300/80">This command has ⚠️ steps, so it asks first. Only skip it if you're sure.</span>
              </span>
              <ToggleSwitch enabled={d.skipConfirm} onChange={(skipConfirm) => set({ skipConfirm })} />
            </label>
          )}
        </Section>

        <Section n={3} title="What it asks for (optional)">
          {d.inputs.map((i, k) => (
            <div key={k} className="grid grid-cols-1 gap-2 rounded-lg bg-base-950 p-2 sm:grid-cols-[1fr_1fr_2fr_auto_auto]">
              <input className={field} value={i.name} placeholder="name" onChange={(e) => set({ inputs: d.inputs.map((x, j) => (j === k ? { ...x, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") } : x)) })} />
              <select className={field} value={i.type} onChange={(e) => set({ inputs: d.inputs.map((x, j) => (j === k ? { ...x, type: e.target.value as InputType } : x)) })}>
                {Object.entries(INPUT_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input className={field} value={i.description} placeholder="Shown in Discord" onChange={(e) => set({ inputs: d.inputs.map((x, j) => (j === k ? { ...x, description: e.target.value } : x)) })} />
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input type="checkbox" checked={i.required} onChange={(e) => set({ inputs: d.inputs.map((x, j) => (j === k ? { ...x, required: e.target.checked } : x)) })} /> Required
              </label>
              <button type="button" className="text-xs text-rose-400" onClick={() => set({ inputs: d.inputs.filter((_, j) => j !== k) })}>
                Remove
              </button>
              {i.type === "choice" && (
                <input className={`${field} sm:col-span-5`} value={i.choices.join(", ")} placeholder="Choices, comma separated" onChange={(e) => set({ inputs: d.inputs.map((x, j) => (j === k ? { ...x, choices: e.target.value.split(",").map((c) => c.trim()) } : x)) })} />
              )}
            </div>
          ))}
          <button type="button" className="text-sm text-neon-blue hover:underline" onClick={() => set({ inputs: [...d.inputs, inp(`input${d.inputs.length + 1}`, "text", "")] })}>
            + Add an input
          </button>
          <p className="text-xs text-slate-500">
            Use them in any step as <code>{"{name}"}</code>. Always available: {tokens.slice(0, 5).map((t) => <code key={t} className="mr-1">{t}</code>)}
          </p>
        </Section>

        <Section n={4} title={`What it does (${d.steps.length} step${d.steps.length === 1 ? "" : "s"}, in order)`}>
          {d.steps.map((s, i) => {
            const def = ACTION_BY_ID[s.action];
            if (!def) return null;
            return (
              <div key={i} className={`rounded-lg border p-2 ${def.risky ? "border-amber-500/40" : "border-white/10"} bg-base-950`}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="grid h-5 w-5 place-items-center rounded bg-white/5 text-[11px] text-slate-400">{i + 1}</span>
                  <b className="font-medium">{def.name}</b>
                  {def.risky && <span className="rounded-full border border-amber-500/40 px-1.5 text-[10px] text-amber-300">asks to confirm</span>}
                  <span className="ml-auto flex gap-2 text-xs text-slate-500">
                    <button type="button" onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)}>
                      ↓
                    </button>
                    <button type="button" className="text-rose-400" onClick={() => set({ steps: d.steps.filter((_, k) => k !== i) })}>
                      ✕
                    </button>
                  </span>
                </div>
                {def.params.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {def.params.map((p) => (
                      <ParamField key={p.k} guildId={guildId} p={p} value={s.params[p.k] ?? ""} inputs={d.inputs} onChange={(v) => setStep(i, { [p.k]: v })} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="neon-button-sm" onClick={() => setPicker(!picker)}>
            {picker ? "Close the list" : `+ Add a step (${ACTIONS.length} actions)`}
          </button>
          {picker && (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2">
              <input className={field} value={q} placeholder="Search: ban, role, onboarding, slowmode…" onChange={(e) => setQ(e.target.value)} autoFocus />
              {ACTION_GROUPS.map(([g, label]) => {
                const list = shown.filter((a) => a.group === g);
                if (!list.length) return null;
                return (
                  <div key={g}>
                    <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {list.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="rounded-md bg-white/[0.03] px-2.5 py-1.5 text-left text-sm hover:bg-white/[0.07]"
                          onClick={() => {
                            set({ steps: [...d.steps, { action: a.id, params: Object.fromEntries(a.params.map((p) => [p.k, p.type === "select" && p.opts?.length ? p.opts[0] : ""])) }] });
                            setPicker(false);
                            setQ("");
                          }}
                        >
                          <b className="font-medium">
                            {a.name}
                            {a.risky ? " ⚠️" : ""}
                          </b>
                          {a.desc && <span className="block text-xs text-slate-500">{a.desc}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section n={5} title="Reply and log">
          <textarea className={`${field} min-h-14`} value={d.reply} onChange={(e) => set({ reply: e.target.value })} placeholder="What Spartacus says when it's done. Use {inputs}." />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Everyone in the channel sees the reply (off: only the person who ran it)</span>
            <ToggleSwitch enabled={d.replyPublic} onChange={(replyPublic) => set({ replyPublic })} />
          </label>
          <label className="block text-xs text-slate-400">
            Also post each run in (optional)
            <ChannelSelect guildId={guildId} value={d.logChannelId} onChange={(id) => set({ logChannelId: id || null })} placeholder="Only the Command Log" />
          </label>
        </Section>
      </div>
      <FormError message={error} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={saving} className="neon-button-sm disabled:opacity-40" onClick={save}>
          {saving ? "Saving…" : start.id ? "Save" : "Create command"}
        </button>
        <button type="button" className="px-2 text-sm text-slate-400 hover:text-white" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </NeonCard>
  );
}

// ---- The list, the log and the catalog ----
const toDraft = (c: CustomSlashCommandRow): CommandDraft & { id: string } => ({
  id: c.id,
  name: c.name,
  description: c.description,
  enabled: c.enabled,
  access: c.access,
  roleIds: c.roleIds,
  channelIds: c.channelIds,
  cooldownSec: c.cooldownSec,
  checkPerms: c.checkPerms,
  skipConfirm: c.skipConfirm,
  inputs: c.inputs,
  steps: c.steps,
  reply: c.reply,
  replyPublic: c.replyPublic,
  logChannelId: c.logChannelId,
});

const RESULT: Record<string, string> = { OK: "✅ Done", PARTIAL: "⚠️ Partly", FAILED: "❌ Failed", DENIED: "🔒 Not allowed", CANCELED: "Canceled" };

export function CommandLog({ guildId, commands }: { guildId: string; commands: CustomSlashCommandRow[] }) {
  const [rows, setRows] = useState<CustomCommandRunRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api.getCustomCommandRuns(guildId, filter || undefined).then(setRows).catch(() => setRows([]));
  }, [guildId, filter]);
  return (
    <NeonCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">📜 Command Log</p>
        <select className={`${field} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All commands</option>
          {commands.map((c) => (
            <option key={c.id} value={c.id}>
              /{c.name}
            </option>
          ))}
        </select>
      </div>
      {!rows && <p className="text-sm text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Nothing has run yet.</p>}
      <div className="divide-y divide-white/5">
        {rows?.map((r) => (
          <button key={r.id} type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="block w-full py-2 text-left text-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <b className="text-neon-blue">/{r.commandName}</b> <span className="text-slate-400">by {r.userName}</span>
              </span>
              <span className="text-xs text-slate-500">
                {RESULT[r.result] ?? r.result} · {new Date(r.createdAt).toLocaleString()}
              </span>
            </span>
            {open === r.id && (
              <span className="mt-1 block space-y-0.5 rounded-md bg-base-950 p-2 text-xs text-slate-300">
                {Object.keys(r.inputs).length > 0 && <span className="block text-slate-500">Inputs: {Object.entries(r.inputs).map(([k, v]) => `${k}=${v}`).join(" · ")}</span>}
                {r.details.map((l, i) => (
                  <span key={i} className="block">
                    {l.replace(/<[@#]&?(\d+)>/g, (m, id: string) => `…${id.slice(-4)}`)}
                  </span>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
    </NeonCard>
  );
}

export function ActionCatalog() {
  const [q, setQ] = useState("");
  const shown = useMemo(() => ACTIONS.filter((a) => !q || `${a.name} ${a.desc}`.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <NeonCard>
      <p className="font-medium">📋 Every action ({ACTIONS.length})</p>
      <p className="mb-3 text-xs text-slate-500">⚠️ asks “Yes, do it” first. Spartacus can't act on anyone (or any role) above its own role.</p>
      <input className={`${field} mb-3`} value={q} placeholder="Search" onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-3">
        {ACTION_GROUPS.map(([g, label]) => {
          const list = shown.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <p className="mb-1 text-sm font-semibold">
                {label} <span className="text-slate-500">({list.length})</span>
              </p>
              <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
                {list.map((a) => (
                  <li key={a.id}>
                    {a.name}
                    {a.risky ? " ⚠️" : ""}
                    {a.desc && <span className="text-xs text-slate-500"> · {a.desc}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">No bot can: read or send in other people's DMs, edit what other people wrote, transfer server ownership, change boosts or Nitro, or act on anyone above its own role.</p>
    </NeonCard>
  );
}

export function CommandBuilder({ guildId, onCommands }: { guildId: string; onCommands?: (c: CustomSlashCommandRow[]) => void }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<CustomSlashCommandRow[] | null>(null);
  const [editing, setEditing] = useState<(CommandDraft & { id?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    api
      .getCustomSlashCommands(guildId)
      .then((r) => {
        setRows(r);
        onCommands?.(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
  useEffect(() => {
    void refresh();
  }, [guildId]);

  if (editing)
    return (
      <Editor
        key={editing.id ?? "new"}
        guildId={guildId}
        start={editing}
        onCancel={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          void refresh();
        }}
      />
    );

  return (
    <NeonCard>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Slash commands</p>
        <button type="button" className="neon-button-sm" onClick={() => setEditing({ ...BLANK })}>
          + New command
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Name your own /command, choose who can use it, and stack any of {ACTIONS.length} actions. It shows up in Discord right away.</p>
      <FormError message={error} />
      {rows?.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No commands yet. Tap + New command and start from a template.</p>}
      <div className="divide-y divide-white/5">
        {rows?.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(toDraft(c))}>
              <p className="font-medium text-neon-blue">/{c.name}</p>
              <p className="truncate text-xs text-slate-500">
                {c.description} · {COMMAND_ACCESS[c.access]} · {c.steps.length} step{c.steps.length === 1 ? "" : "s"}
              </p>
            </button>
            <div className="flex items-center gap-3">
              <ToggleSwitch
                enabled={c.enabled}
                label={`Turn /${c.name} on or off`}
                onChange={async (enabled) => {
                  setError(null);
                  try {
                    await api.updateCustomSlashCommand(guildId, c.id, { ...toDraft(c), enabled });
                    void refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn't change it.");
                  }
                }}
              />
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-rose-400"
                onClick={async () => {
                  if (!(await confirm(`Delete /${c.name}? It disappears from Discord right away.`, { danger: true }))) return;
                  await api.deleteCustomSlashCommand(guildId, c.id);
                  void refresh();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </NeonCard>
  );
}
