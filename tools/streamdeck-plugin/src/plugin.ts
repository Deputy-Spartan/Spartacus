import streamDeck, { type Action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ALL, idFromUuid } from "./actions";
import { clip, iconImage, keyImage, plain, type Face } from "./draw";

// The Spartacus Stream Deck plugin. Keys and dials show live info from
// Spartacus and run their action on press. The connection key from the
// dashboard is stored once, in the plugin's global settings.

type Globals = JsonObject & {
  apiKey?: string;
  apiUrl?: string;
};
type Settings = JsonObject & Record<string, string | number | boolean | undefined>;
interface Visible {
  action: Action<Settings>;
  id: string; // which Spartacus action
  settings: Settings;
}

const DEFAULT_API = "https://api.spartc.us";
const visible = new Map<string, Visible>();
const faces = new Map<string, Face>();
const armed = new Map<string, number>();
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
let globals: Globals = {};

const def = (id: string) => ALL.find((a) => a.id === id);

async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!globals.apiKey) throw new Error("Paste your connection key");
  const res = await fetch(`${(globals.apiUrl || DEFAULT_API).replace(/\/+$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${globals.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(json.error || json.message || `Spartacus said ${res.status}`);
  return json;
}

// ---- Drawing (src/draw.ts) ----

async function draw(v: Visible, face: Face) {
  faces.set(v.action.id, face);
  const d = def(v.id);
  if (v.action.isKey()) {
    const pressAgain = armed.has(v.action.id) && Date.now() < (armed.get(v.action.id) ?? 0);
    await v.action.setImage(keyImage(face, d?.glyph, pressAgain));
    await v.action.setTitle("");
  } else if (v.action.isDial()) {
    await v.action.setFeedback({ icon: iconImage(d?.glyph, face.tone), title: plain(face.title), value: plain(face.line), indicator: { value: Math.round(Math.max(0, Math.min(1, face.pct ?? 0)) * 100) } });
  }
}

async function problem(v: Visible, text: string) {
  await draw(v, { title: def(v.id)?.name ?? "Spartacus", line: text, tone: "off" });
}

// ---- Keeping faces fresh ----
let refreshing = false;
async function refreshAll() {
  if (refreshing || visible.size === 0) return;
  refreshing = true;
  try {
    if (!globals.apiKey) {
      for (const v of visible.values()) await problem(v, "Set up");
      return;
    }
    const items = [...visible.values()].map((v) => ({ id: v.action.id, action: v.id, settings: v.settings }));
    const res = await api<{ faces: Record<string, Face> }>("/sd/v1/faces", { items });
    for (const v of visible.values()) {
      const f = res.faces[v.action.id];
      if (f) await draw(v, f);
    }
  } catch (err) {
    for (const v of visible.values()) await problem(v, err instanceof Error ? clip(err.message, 14) : "Offline");
  } finally {
    refreshing = false;
  }
}
setInterval(() => void refreshAll(), 5000);

// ---- Running ----
interface RunResult {
  ok: boolean;
  message: string;
  openUrl?: string;
  face?: Face;
}
async function run(v: Visible, op: "press" | "turn" | "tap", value?: number) {
  try {
    const r = await api<RunResult>("/sd/v1/run", { action: v.id, settings: v.settings, op, value });
    if (r.openUrl) await streamDeck.system.openUrl(r.openUrl);
    if (op === "press") {
      if (v.action.isKey()) await (r.ok ? v.action.showOk() : v.action.showAlert());
      else if (v.action.isDial() && !r.ok) await v.action.showAlert();
    }
    if (!r.ok) streamDeck.logger.warn(`${v.id}: ${r.message}`);
    if (r.face) await draw(v, r.face);
    setTimeout(() => void refreshAll(), 400);
  } catch (err) {
    if (v.action.isKey()) await v.action.showAlert();
    streamDeck.logger.error(err instanceof Error ? err.message : String(err));
  }
}

// Risky actions ask for a second press within 3 seconds.
async function needsSecondPress(v: Visible) {
  const d = def(v.id);
  if (!d?.confirm || v.settings.confirm === false) return false;
  if (v.id === "raid" && faces.get(v.action.id)?.line === "LOCKED") return false; // undoing never asks
  const until = armed.get(v.action.id) ?? 0;
  if (Date.now() < until) {
    armed.delete(v.action.id);
    return false;
  }
  armed.set(v.action.id, Date.now() + 3000);
  const f = faces.get(v.action.id);
  if (f) await draw(v, f);
  setTimeout(() => {
    armed.delete(v.action.id);
    const ff = faces.get(v.action.id);
    if (ff && visible.has(v.action.id)) void draw(v, ff);
  }, 3000);
  return true;
}

// ---- Stream Deck events ----
streamDeck.actions.onWillAppear<Settings>(async (ev) => {
  const v: Visible = { action: ev.action as Action<Settings>, id: idFromUuid(ev.action.manifestId), settings: ev.payload.settings };
  visible.set(ev.action.id, v);
  await refreshAll();
});
streamDeck.actions.onWillDisappear((ev) => {
  visible.delete(ev.action.id);
});
streamDeck.settings.onDidReceiveSettings<Settings>(async (ev) => {
  const v = visible.get(ev.action.id);
  if (v) {
    v.settings = ev.payload.settings;
    await refreshAll();
  }
});
streamDeck.settings.onDidReceiveGlobalSettings<Globals>(async (ev) => {
  globals = ev.settings;
  optionsCache = null;
  await refreshAll();
});

streamDeck.actions.onKeyDown<Settings>(async (ev) => {
  const v = visible.get(ev.action.id);
  if (!v) return;
  if (!globals.apiKey) return void (await ev.action.showAlert());
  if (await needsSecondPress(v)) return;
  await run(v, "press");
});

// Dials: turning only changes what the screen shows, then the change is sent
// a moment after you stop, so Discord isn't hit on every click of the dial.
const DIAL_SLOW = [0, 5, 10, 15, 30, 60, 120, 300, 600];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
streamDeck.actions.onDialRotate<Settings>(async (ev) => {
  const v = visible.get(ev.action.id);
  if (!v) return;
  const t = ev.payload.ticks;
  const s = v.settings;
  const f = faces.get(v.action.id) ?? { title: def(v.id)?.name ?? "", line: "", tone: "" as const };
  let send: number | null = null;
  if (v.id === "dslow") {
    const cur = DIAL_SLOW.indexOf(Number(String(f.line).replace(/[^0-9]/g, "")) * (String(f.line).endsWith("m") ? 60 : 1));
    const i = clamp((typeof s.slowIndex === "number" ? s.slowIndex : cur < 0 ? 0 : cur) + t, 0, DIAL_SLOW.length - 1);
    s.slowIndex = i;
    const n = DIAL_SLOW[i];
    await draw(v, { ...f, line: n ? (n >= 60 ? `${n / 60}m` : `${n}s`) : "Off", tone: n ? "warn" : "", pct: i / (DIAL_SLOW.length - 1) });
    send = i;
  } else if (v.id === "dlimit") {
    const cur = Number(String(f.line).replace(/[^0-9]/g, "")) || 0;
    const n = clamp((typeof s.limit === "number" ? s.limit : cur) + t, 0, 99);
    s.limit = n;
    await draw(v, { ...f, line: n ? `Limit ${n}` : "No limit", pct: n / 99 });
    send = n;
  } else if (v.id === "dlock") {
    s.index = (Number(s.index) || 0) + t;
  } else if (v.id === "dstats") {
    s.stat = (Number(s.stat) || 0) + t;
  } else if (v.id === "dtimer") {
    const m = clamp((Number(s.minutes) || 60) + t * 5, 5, 240);
    s.minutes = m;
    await draw(v, { ...f, line: `${m} min`, pct: m / 120 });
  } else if (v.id === "dxp") {
    const b = clamp((Number(s.boost) || 2) + t * 0.5, 1, 3);
    s.boost = b;
    await draw(v, { ...f, title: "XP Boost", line: `${b}x · press`, pct: (b - 1) / 2 });
  } else if (v.id === "dpurge") {
    const c = clamp((Number(s.count) || 10) + t * 5, 5, 100);
    s.count = c;
    await draw(v, { ...f, line: `${c} msgs`, pct: c / 100 });
  }
  await v.action.setSettings(s);
  clearTimeout(turnTimers.get(v.action.id));
  turnTimers.set(
    v.action.id,
    setTimeout(() => {
      if (send !== null) void run(v, "turn", send);
      else void refreshAll();
    }, 700),
  );
});
streamDeck.actions.onDialDown<Settings>(async (ev) => {
  const v = visible.get(ev.action.id);
  if (!v || !globals.apiKey) return;
  if (await needsSecondPress(v)) return;
  await run(v, "press");
});
streamDeck.actions.onTouchTap<Settings>(async (ev) => {
  const v = visible.get(ev.action.id);
  if (!v) return;
  if (v.id === "dtimer") v.settings.mode = v.settings.mode === "poll" ? "giveaway" : "poll";
  if (v.id === "dstats") v.settings.stat = (Number(v.settings.stat) || 0) + 1;
  await v.action.setSettings(v.settings);
  await refreshAll();
});

// ---- The settings panel's dropdowns (sdpi-components "datasource") ----
let optionsCache: { at: number; data: Record<string, Array<{ value: string; label: string }>> } | null = null;
streamDeck.ui.onSendToPlugin<{ event?: string }>(async (ev) => {
  const event = ev.payload?.event;
  if (!event) return;
  if (!globals.apiKey) globals = await streamDeck.settings.getGlobalSettings<Globals>();
  try {
    if (event === "test") {
      const me = await api<{ guild: { name: string } }>("/sd/v1/me");
      return void (await streamDeck.ui.sendToPropertyInspector({ event: "test", ok: true, message: `Connected to ${me.guild.name}` }));
    }
    if (!optionsCache || Date.now() - optionsCache.at > 60_000) optionsCache = { at: Date.now(), data: await api("/sd/v1/options") };
    const list = optionsCache.data[event] ?? [];
    await streamDeck.ui.sendToPropertyInspector({ event, items: list.map((o) => ({ value: o.value, label: o.label })) });
  } catch (err) {
    await streamDeck.ui.sendToPropertyInspector({ event, items: [], ok: false, message: err instanceof Error ? err.message : "Not connected" });
  }
});

void (async () => {
  await streamDeck.connect();
  globals = await streamDeck.settings.getGlobalSettings<Globals>();
  await refreshAll();
})();
