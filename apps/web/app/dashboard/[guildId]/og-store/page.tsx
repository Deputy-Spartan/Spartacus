"use client";

import { useEffect, useMemo, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { FormError } from "../../../../components/ui/FormError";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { api } from "../../../../lib/api";
import { OG_ALERTS, OG_SETUP_LABELS, type OgAlertKey, type OgProduct, type OgRouting, type OgSummary, type OgTickets } from "../../../../lib/ogStore";

// Owner Only → Store: run the store website from Spartacus. Reads and changes the store
// through the API (which talks to the store with STORE_BRIDGE_SECRET) and posts to Discord as Spartacus.
type Tab = "overview" | "channels" | "post" | "website";
const TABS: Array<[Tab, string]> = [["overview", "📊 Overview"], ["channels", "📡 Channels"], ["post", "📣 Post to Discord"], ["website", "🌐 Store website"]];
const field = "w-full bg-base-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm";
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OgStorePage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [data, setData] = useState<OgSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const load = () =>
    api.getOgStore().then(
      (d) => { setData(d); setError(null); },
      (e: Error) => setError(e.message),
    );
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🛒 Store</h1>
          <p className="text-sm text-slate-400">Run the store website from here: alerts, ticket channels, Discord posts and the store banner.</p>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2">
            <a href={data.store.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:border-neon-blue">Open store ↗</a>
            <a href={`${data.store.url}/admin`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:border-neon-blue">Store admin ↗</a>
          </div>
        )}
      </div>

      {error && !data && (
        <NeonCard>
          <h2 className="font-semibold mb-1">The store isn't connected</h2>
          <p className="text-sm text-slate-300">{error}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-400">
            <li>Make a long random key (32+ characters).</li>
            <li>Render → Spartacus API → Environment: add <code className="text-neon-blue">STORE_BRIDGE_SECRET</code> with that key.</li>
            <li>Netlify → the store → Environment variables: add <code className="text-neon-blue">STORE_BRIDGE_SECRET</code> with the same key, then Deploys → Trigger deploy.</li>
          </ol>
          <button type="button" onClick={load} className="neon-button mt-3">Try again</button>
        </NeonCard>
      )}
      {!data && !error && <p className="text-sm text-slate-400">Loading the store…</p>}

      {data && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-white/5 pb-2" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 text-sm ${tab === id ? "bg-neon-blue/15 text-slate-100" : "text-slate-400 hover:text-slate-100"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && <Overview data={data} />}
          {tab === "channels" && <Channels guildId={guildId} data={data} onSaved={load} />}
          {tab === "post" && <Post guildId={guildId} data={data} />}
          {tab === "website" && <Website data={data} onSaved={load} />}
        </>
      )}
    </div>
  );
}

function Overview({ data }: { data: OgSummary }) {
  const s = data.stats;
  const mode = data.features.checkout ? ["Open: taking orders", "text-emerald-300"] : data.features.signin ? ["Sign-in only: checkout opens soon", "text-amber-300"] : ["Preview: opening soon", "text-amber-300"];
  const tile = (label: string, value: string, note?: string) => (
    <NeonCard>
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {note && <p className="text-xs text-slate-400">{note}</p>}
    </NeonCard>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm">Store: <span className={mode[1]}>{mode[0]}</span>{s && !s.live ? <span className="text-slate-500"> · showing test payments</span> : null}</p>
      {s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tile("Revenue, 30 days", money(s.money.month), `${money(s.money.today)} today · ${money(s.money.all_time)} all time`)}
          {tile("Orders, 30 days", String(s.counts.orders_month), `${s.counts.active_subs} active subscriptions`)}
          {tile("Open tickets", String(s.tickets.open), `${s.tickets.answered} waiting on the customer`)}
          {tile("Needs a look", String(s.counts.pending_roles + s.counts.past_due + s.counts.disputes), `${s.counts.pending_roles} roles pending · ${s.counts.past_due} cards declined · ${s.counts.disputes} chargebacks`)}
        </div>
      ) : (
        <NeonCard><p className="text-sm text-slate-300">Orders, revenue and tickets show here once the store's database is connected (DATABASE_URL on Netlify).</p></NeonCard>
      )}
      <NeonCard>
        <h2 className="font-semibold mb-2">Setup</h2>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {OG_SETUP_LABELS.map(([key, label]) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span className={data.setup[key] ? "text-emerald-400" : "text-slate-500"}>{data.setup[key] ? "✓" : "○"}</span>
              <span className={data.setup[key] ? "" : "text-slate-400"}>{label}</span>
            </li>
          ))}
        </ul>
      </NeonCard>
    </div>
  );
}

function Channels({ guildId, data, onSaved }: { guildId: string; data: OgSummary; onSaved: () => void }) {
  const [routing, setRouting] = useState<OgRouting>(data.routing);
  const [tickets, setTickets] = useState<OgTickets>(data.tickets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(routing) !== JSON.stringify(data.routing) || JSON.stringify(tickets) !== JSON.stringify(data.tickets);
  const setRoute = (key: OgAlertKey, patch: Partial<OgRouting["routes"][OgAlertKey]>) =>
    setRouting((r) => ({ ...r, routes: { ...r.routes, [key]: { ...r.routes[key], ...patch } } }));

  const save = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.saveOgStoreRouting(routing);
      await api.saveOgStoreTickets(tickets);
      setNotice("Saved. The store uses these right away.");
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const test = async (key: OgAlertKey) => {
    setError(null); setNotice(null);
    try { await api.testOgStoreAlert(key); setNotice("Test alert sent. Check the channel in Discord."); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <NeonCard>
        <h2 className="font-semibold">Store alerts</h2>
        <p className="mb-3 text-sm text-slate-400">The store posts these in Discord as they happen, pinging only the role you pick.</p>
        <div className="divide-y divide-white/5">
          {OG_ALERTS.map((a) => {
            const r = routing.routes[a.key];
            return (
              <div key={a.key} className="grid gap-3 py-3 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center">
                <div className="flex items-start gap-3">
                  <ToggleSwitch enabled={r.on} onChange={(on) => setRoute(a.key, { on })} />
                  <div>
                    <p className="text-sm font-semibold">{a.label} <span className={`ml-1 rounded-full border px-1.5 text-[10px] ${a.audience === "Public" ? "border-amber-400/40 text-amber-300" : "border-neon-blue/40 text-neon-blue"}`}>{a.audience}</span></p>
                    <p className="text-xs text-slate-400">{a.detail}</p>
                  </div>
                </div>
                <ChannelSelect guildId={guildId} value={r.channelId || null} onChange={(channelId) => setRoute(a.key, { channelId })} showCurrent={false} />
                <div>
                  <RoleSelect guildId={guildId} value={r.pingRoleId || null} onChange={(pingRoleId) => setRoute(a.key, { pingRoleId })} placeholder="No ping" />
                  {r.pingRoleId && <button type="button" className="mt-1 text-xs text-slate-400 hover:text-slate-100" onClick={() => setRoute(a.key, { pingRoleId: "" })}>Don't ping</button>}
                </div>
                <button type="button" disabled={dirty || !data.routing.routes[a.key].channelId} title={dirty ? "Save first" : undefined}
                  onClick={() => test(a.key)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm disabled:opacity-40">Test</button>
              </div>
            );
          })}
        </div>
      </NeonCard>

      <NeonCard>
        <h2 className="font-semibold">Store tickets in Discord</h2>
        <div className="mt-3 flex items-start gap-3">
          <ToggleSwitch enabled={tickets.discordTickets} onChange={(discordTickets) => setTickets((t) => ({ ...t, discordTickets }))} />
          <p className="text-sm text-slate-300">Open a private channel for each store ticket. Staff answer there or on the website, and the website keeps the whole conversation.</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Category for ticket channels</span>
            <ChannelSelect guildId={guildId} kind="category" value={tickets.ticketCategoryId || null} onChange={(ticketCategoryId) => setTickets((t) => ({ ...t, ticketCategoryId }))} placeholder="Top of the server" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">New ticket alerts (optional)</span>
            <ChannelSelect guildId={guildId} value={tickets.ticketChannelId || null} onChange={(ticketChannelId) => setTickets((t) => ({ ...t, ticketChannelId }))} showCurrent={false} />
          </label>
        </div>
      </NeonCard>

      <FormError message={error} />
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}
      <div className="flex gap-2">
        <button type="button" className="neon-button" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm disabled:opacity-40" disabled={!dirty || busy} onClick={() => { setRouting(data.routing); setTickets(data.tickets); }}>Undo</button>
      </div>
    </div>
  );
}

type Template = "launch" | "sale" | "update" | "custom";
const TEMPLATES: Array<[Template, string]> = [["launch", "New product"], ["sale", "Sale"], ["update", "Update"], ["custom", "Write my own"]];
function fill(t: Template, p: OgProduct | undefined) {
  if (!p || t === "custom") return { title: "", description: "" };
  if (t === "sale") return { title: `${p.name} is on sale`, description: `${p.short}\n\nGrab it before the sale ends.` };
  if (t === "update") return { title: `${p.name} update`, description: "What's new:\n• \n\nDownload it again from My Library." };
  return { title: `New: ${p.name}`, description: `${p.short}\n\nAvailable now in the store.` };
}

function Post({ guildId, data }: { guildId: string; data: OgSummary }) {
  const products = useMemo(() => data.products.filter((p) => !p.hidden), [data.products]);
  const [tpl, setTpl] = useState<Template>("launch");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  const [text, setText] = useState(() => fill("launch", products[0]));
  const [channels, setChannels] = useState<string[]>(data.routing.routes.news.channelId ? [data.routing.routes.news.channelId] : []);
  const [adding, setAdding] = useState("");
  const [ping, setPing] = useState<"" | "here" | "role">(data.routing.routes.news.pingRoleId ? "role" : "");
  const [pingRole, setPingRole] = useState(data.routing.routes.news.pingRoleId || "");
  const [buy, setBuy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = (t: Template, id = productId) => { setTpl(t); setText(fill(t, products.find((p) => p.id === id))); };
  const post = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await api.postOgStore({
        guildId, channelIds: channels, title: text.title, description: text.description,
        url: product?.url, image: product?.image ?? null,
        ping: ping === "here" ? "here" : ping === "role" ? pingRole : "",
        fields: product ? [{ name: "Price", value: product.was ? `~~${product.was}~~ ${product.price}` : product.price }, { name: "Category", value: product.category }] : [],
        buttons: product && buy ? [{ label: "🛒 Buy now", url: product.url }] : [{ label: "Visit the store", url: data.store.url }],
      });
      setNotice(`Posted in ${r.posted} channel${r.posted === 1 ? "" : "s"}.${r.errors.length ? ` Not posted: ${r.errors.join(" ")}` : ""}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <NeonCard>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(([id, label]) => (
              <button key={id} type="button" onClick={() => pick(id)} className={`rounded-full border px-3 py-1 text-xs ${tpl === id ? "border-amber-400 text-amber-300" : "border-white/10 text-slate-400"}`}>{label}</button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Product</span>
            <select className={field} value={productId} onChange={(e) => { setProductId(e.target.value); pick(tpl, e.target.value); }}>
              <option value="">No product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.price}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Title</span>
            <input className={field} maxLength={256} value={text.title} onChange={(e) => setText((t) => ({ ...t, title: e.target.value }))} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Message</span>
            <textarea className={field} rows={6} maxLength={4000} value={text.description} onChange={(e) => setText((t) => ({ ...t, description: e.target.value }))} />
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Channels (up to 5)</span>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {channels.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-xs">
                  &lt;#{id.slice(-4)}&gt;
                  <button type="button" aria-label="Remove channel" onClick={() => setChannels((c) => c.filter((x) => x !== id))}>×</button>
                </span>
              ))}
              {!channels.length && <span className="text-xs text-slate-500">No channels yet.</span>}
            </div>
            <div className="flex gap-2">
              <div className="flex-1"><ChannelSelect guildId={guildId} value={adding || null} onChange={setAdding} showCurrent={false} /></div>
              <button type="button" className="rounded-lg border border-white/10 px-3 text-sm disabled:opacity-40" disabled={!adding || channels.length >= 5}
                onClick={() => { setChannels((c) => [...new Set([...c, adding])]); setAdding(""); }}>Add</button>
            </div>
          </div>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Ping</span>
            <div className="flex flex-wrap gap-1.5">
              {([["", "No ping"], ["here", "@here"], ["role", "A role"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setPing(id)} className={`rounded-lg border px-2.5 py-1 text-xs ${ping === id ? "border-neon-blue text-slate-100" : "border-white/10 text-slate-400"}`}>{label}</button>
              ))}
            </div>
            {ping === "role" && <div className="mt-2"><RoleSelect guildId={guildId} value={pingRole || null} onChange={setPingRole} /></div>}
          </div>
          {product && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={buy} onChange={(e) => setBuy(e.target.checked)} /> Add a “Buy now” button
            </label>
          )}
          <FormError message={error} />
          {notice && <p className="text-sm text-emerald-300">{notice}</p>}
          <button type="button" className="neon-button" disabled={busy || !channels.length || !(text.title || text.description) || (ping === "role" && !pingRole)} onClick={post}>
            {busy ? "Posting…" : "Post now"}
          </button>
        </div>
      </NeonCard>

      <NeonCard>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Preview</p>
        <div className="rounded-lg bg-[#313338] p-3 text-[#dbdee1]">
          <p className="text-sm font-semibold text-white">Spartacus <span className="rounded bg-[#5865f2] px-1 text-[10px] text-white">APP</span></p>
          {ping && <p className="text-sm"><span className="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">{ping === "here" ? "@here" : "@role"}</span></p>}
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-3 rounded border-l-4 border-[#e7bb5f] bg-[#2b2d31] p-3">
            <div className="min-w-0">
              <p className="font-semibold text-[#00a8fc]">{text.title || "Your title"}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{text.description || "Your message"}</p>
              {product && (
                <div className="mt-2 flex gap-6 text-sm">
                  <div><p className="text-xs font-semibold text-white">Price</p>{product.was && <s className="text-[#949ba4]">{product.was} </s>}{product.price}</div>
                  <div><p className="text-xs font-semibold text-white">Category</p>{product.category}</div>
                </div>
              )}
              <p className="mt-2 text-xs text-[#949ba4]">Outpost Gaming Store · {data.store.url.replace(/^https:\/\//, "")}</p>
            </div>
            {product?.image && <img src={product.image} alt="" className="h-16 w-16 rounded object-cover" />}
          </div>
          <div className="mt-2 flex gap-2">
            <span className="rounded bg-[#4e5058] px-3 py-1.5 text-sm text-white">{product && buy ? "🛒 Buy now ↗" : "Visit the store ↗"}</span>
          </div>
        </div>
      </NeonCard>
    </div>
  );
}

function Website({ data, onSaved }: { data: OgSummary; onSaved: () => void }) {
  const [banner, setBanner] = useState(data.banner.announcement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const save = async (value: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await api.saveOgStoreBanner(value);
      setBanner(r.banner.announcement);
      setNotice(r.banner.announcement ? "Banner is live on the store." : "Banner removed.");
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <NeonCard>
        <h2 className="font-semibold">Announcement banner</h2>
        <p className="mb-3 text-sm text-slate-400">The strip across the top of every store page. Leave it empty to hide it.</p>
        <input className={field} maxLength={200} value={banner} placeholder="Launch week: 20% off with code LAUNCH20" onChange={(e) => setBanner(e.target.value)} />
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          {banner.trim() ? <div className="bg-amber-400 px-3 py-1.5 text-center text-sm font-semibold text-[#1d1404]">{banner}</div> : <div className="px-3 py-1.5 text-center text-xs text-slate-500">No banner</div>}
          <div className="h-10 bg-base-950" />
        </div>
        <FormError message={error} />
        {notice && <p className="mt-2 text-sm text-emerald-300">{notice}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" className="neon-button" disabled={busy || banner.trim() === data.banner.announcement} onClick={() => save(banner)}>{busy ? "Saving…" : "Save banner"}</button>
          {data.banner.announcement && <button type="button" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm" disabled={busy} onClick={() => save("")}>Remove</button>}
        </div>
      </NeonCard>
      <NeonCard>
        <h2 className="font-semibold">Products, prices and discounts</h2>
        <p className="text-sm text-slate-400">Edit these in the store admin. Signed in with your Discord, it opens straight to the shop editor.</p>
        <a href={`${data.store.url}/admin`} target="_blank" rel="noopener noreferrer" className="neon-button mt-3 inline-block">Open store admin ↗</a>
        <ul className="mt-3 divide-y divide-white/5 text-sm">
          {data.products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">{p.name} {p.hidden && <span className="ml-1 text-xs text-slate-500">(hidden)</span>}</span>
              <span className="shrink-0 tabular-nums text-slate-400">{p.price}</span>
            </li>
          ))}
        </ul>
      </NeonCard>
    </div>
  );
}
