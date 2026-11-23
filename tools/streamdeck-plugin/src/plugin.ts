import streamDeck, { type Action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ALL, idFromUuid } from "./actions";
import { clip, iconImage, keyImage, plain, type Face } from "./draw";

// The Spartacus Stream Deck plugin. Keys and dials show live info from
// Spartacus and run their action on press. The connection key from the
// dashboard is stored once, in the plugin's global settings.

// apiKey is the server the keys control right now; servers is every server
// connected so far (a key from each one's dashboard), for the Server dropdown
// and the Switch Server key.
type Server = { key: string; name: string };
type Globals = JsonObject & {
  apiKey?: string;
  apiUrl?: string;
  servers?: Server[];
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
    // The Switch Server key is drawn here; everything else comes from Spartacus.
    for (const v of visible.values()) if (v.id === "server") await draw(v, serverFace());
    const items = [...visible.values()].filter((v) => v.id !== "server").map((v) => ({ id: v.action.id, action: v.id, settings: v.settings }));
    if (!items.length) return;
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

// ---- Servers ----
const servers = () => (Array.isArray(globals.servers) ? globals.servers : []);
const currentServer = () => servers().find((s) => s.key === globals.apiKey);
function serverFace(): Face {
  const list = servers(), cur = currentServer();
  if (!cur) return { title: "Server", line: globals.apiKey ? "Checking…" : "Set up", tone: "off" };
  return { title: list.length > 1 ? `Server ${list.indexOf(cur) + 1}/${list.length}` : "Server", line: clip(cur.name, 14), tone: "green" };
}
async function saveGlobals(next: Globals) {
  globals = next;
  await streamDeck.settings.setGlobalSettings(globals);
  optionsCache = null;
}
// Remembers the server a working key belongs to.
async function rememberServer(name: string) {
  if (!globals.apiKey) return;
  const list = servers().filter((s) => s.key !== globals.apiKey);
  const i = servers().findIndex((s) => s.key === globals.apiKey);
  const entry = { key: globals.apiKey, name };
  if (i >= 0) list.splice(i, 0, entry);
  else list.push(entry);
  if (JSON.stringify(list) !== JSON.stringify(servers())) await saveGlobals({ ...globals, servers: list });
}
// The Switch Server key: on to the next connected server.
async function nextServer() {
  const list = servers();
  if (list.length < 2) return false;
  const i = list.findIndex((s) => s.key === globals.apiKey);
  await saveGlobals({ ...globals, apiKey: list[(i + 1) % list.length].key });
  await refreshAll();
  return true;
}

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
  if (v.id === "server") return void (await ((await nextServer()) ? ev.action.showOk() : ev.action.showAlert()));
  if (!globals.apiKey) return void (await ev.action.showAlert());
  if (await needsSecondPress(v)) return;
  await run(v, "press");
});

// Dials: turning only changes what the screen shows, then the change is sent
// a moment after you stop, so Discord isn't hit on every click of the dial.
const DIAL_SLOW = [0, 5, 10, 15, 30, 60, 120, 300, 600];
const moneyTicks = new Map<string, number>(); // Money Dial clicks not sent yet
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
  } else if (v.id === "dmoney") {
    // Clicks add up on screen, then go as one change when you stop turning.
    const n = (moneyTicks.get(v.action.id) ?? 0) + t;
    moneyTicks.set(v.action.id, n);
    const step = Number(String(s.amount ?? "").replace(/[^0-9-]/g, "")) || 1000;
    const total = step * n;
    await draw(v, { ...f, line: `${total < 0 ? "−" : "+"}${Math.abs(total).toLocaleString("en-US")}`, tone: total < 0 ? "red" : "green" });
    send = n;
  } else if (v.id === "dkd") {
    // Same as the Money Dial: clicks add up, then go as one change.
    const n = (moneyTicks.get(v.action.id) ?? 0) + t;
    moneyTicks.set(v.action.id, n);
    await draw(v, { ...f, line: `${n < 0 ? "−" : "+"}${Math.abs(n)} kill${Math.abs(n) === 1 ? "" : "s"}`, tone: n < 0 ? "red" : "green" });
    send = n;
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
      moneyTicks.delete(v.action.id);
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
      await rememberServer(me.guild.name);
      // Refresh the Server list in the panel too.
      await streamDeck.ui.sendToPropertyInspector({ event: "servers", items: servers().map((s) => ({ value: s.key, label: s.name })) });
      return void (await streamDeck.ui.sendToPropertyInspector({ event: "test", ok: true, message: `Connected to ${me.guild.name}`, servers: servers().length }));
    }
    // The Server dropdown: every server connected so far.
    if (event === "servers") return void (await streamDeck.ui.sendToPropertyInspector({ event, items: servers().map((s) => ({ value: s.key, label: s.name })) }));
    if (event === "forget") {
      const list = servers().filter((s) => s.key !== globals.apiKey);
      await saveGlobals({ ...globals, servers: list, apiKey: list[0]?.key ?? "" });
      await refreshAll();
      return void (await streamDeck.ui.sendToPropertyInspector({ event: "forgot", servers: list.length }));
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
  // A key saved before servers were remembered: add it to the list.
  if (globals.apiKey && !currentServer()) {
    const me = await api<{ guild: { name: string } }>("/sd/v1/me").catch(() => null);
    if (me) await rememberServer(me.guild.name);
  }
  await refreshAll();
})();
