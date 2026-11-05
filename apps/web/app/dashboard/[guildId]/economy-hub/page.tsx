"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CHAMP_CATEGORIES,
  CRATE_INFO,
  CRATE_RARITIES,
  CRATE_TABLE,
  EVENT_TIMEZONES,
  LEVEL_LADDER,
  SHOP_ITEM_TYPES,
  levelColor,
  xpForLevel,
  type CrateRarity,
  type EconomyPlusSettings,
  type ShopItemType,
} from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type EconomyHubView, type ShopItemRow } from "../../../../lib/api";

const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const select = "bg-base-950 border border-white/10 rounded-lg px-2.5 py-2 text-sm";
const label = "text-xs uppercase tracking-wide text-slate-500 block mb-1.5";

function Step({ n, title, desc, on, onToggle, children }: { n: number; title: string; desc: string; on?: boolean; onToggle?: (v: boolean) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(n <= 2);
  return (
    <NeonCard>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex flex-1 min-w-0 items-start gap-3 text-left">
          <span className={`flex-none w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${on === false ? "bg-white/5 text-slate-500" : "bg-neon-blue/20 text-neon-blue"}`}>{n}</span>
          <span className="min-w-0">
            <span className="block font-semibold">{title}</span>
            <span className="block text-xs text-slate-400">{desc}</span>
          </span>
          <span className={`ml-auto text-slate-500 text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
        </button>
        {onToggle && <ToggleSwitch enabled={!!on} onChange={onToggle} label={title} />}
      </div>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </NeonCard>
  );
}

const BLANK_ITEM = { emoji: "🛒", name: "", description: "", price: 500, type: "ROLE" as ShopItemType, roleId: null as string | null, durationDays: 7 as number | null, boostMult: 2, boostMinutes: 60, crateRarity: "rare" as CrateRarity, stock: null as number | null, enabled: true };

export default function EconomyHubPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [hub, setHub] = useState<EconomyHubView | null>(null);
  const [modules, setModules] = useState<{ LEVELING: boolean; ECONOMY: boolean }>({ LEVELING: false, ECONOMY: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof BLANK_ITEM & { id?: string }>(BLANK_ITEM);
  const [editing, setEditing] = useState(false);
  const [levelChannel, setLevelChannel] = useState<string | null>(null);

  useEffect(() => {
    api.getEconomyHub(guildId).then(setHub).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load."));
    api.getModules(guildId).then((m) => setModules({ LEVELING: !!m.LEVELING?.enabled, ECONOMY: !!m.ECONOMY?.enabled }));
    api.getLevelingSettings(guildId).then((s) => setLevelChannel(s.channelId)).catch(() => null);
  }, [guildId]);

  if (!hub) return <p className="text-slate-400">{error ?? "Loading…"}</p>;
  const s = hub.settings;

  async function save(next: Partial<EconomyPlusSettings>, panel = hub!.panel, repost = false) {
    const body = { settings: { ...hub!.settings, ...next }, panel, repost };
    setHub({ ...hub!, settings: body.settings, panel });
    setSaving(true);
    try {
      setHub(await api.saveEconomyHub(guildId, body));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }
  async function setModule(key: "LEVELING" | "ECONOMY", on: boolean) {
    setModules((m) => ({ ...m, [key]: on }));
    await api.setModule(guildId, key, on).catch(() => setModules((m) => ({ ...m, [key]: !on })));
  }
  async function saveItem() {
    try {
      setHub(draft.id ? await api.updateShopItem(guildId, draft.id, draft) : await api.addShopItem(guildId, draft));
      setDraft(BLANK_ITEM);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the item.");
    }
  }
  async function removeItem(it: ShopItemRow) {
    if (!(await confirm(`Remove “${it.name}” from the shop?`, { title: "Remove item", confirmLabel: "Remove", danger: true }))) return;
    setHub(await api.deleteShopItem(guildId, it.id));
  }
  const ladderLinked = LEVEL_LADDER.filter((r) => hub.levelRoles.some((l) => l.level === r.level)).length;
  const sel = <T extends string | number>(value: T, options: Array<[T, string]>, onChange: (v: T) => void, aria: string) => (
    <select className={select} value={String(value)} aria-label={aria} onChange={(e) => onChange((typeof value === "number" ? Number(e.target.value) : e.target.value) as T)}>
      {options.map(([v, t]) => (
        <option key={String(v)} value={String(v)}>
          {t}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="ECONOMY"
        title="Economy Hub"
        description="Levels, coins and everything worth earning, in one place. Go through the steps in order; each part has its own on/off switch."
      />
      {error && <p className="text-sm text-rose-400 mb-3">{error}</p>}
      {saving && <p className="text-xs text-slate-500 mb-2">Saving…</p>}

      <div className="space-y-4 max-w-4xl">
        <Step n={1} title="Turn on XP and coins" desc="Members earn XP and coins by chatting (once a minute) and, with step 7, in voice.">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <span className="text-sm">
                <b>XP &amp; Levels</b>
                <span className="block text-xs text-slate-500">100 XP per level: level 10 = 1,000 XP, 20 = 2,000…</span>
              </span>
              <ToggleSwitch enabled={modules.LEVELING} onChange={(v) => setModule("LEVELING", v)} label="XP and levels" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <span className="text-sm">
                <b>Coins</b>
                <span className="block text-xs text-slate-500">Turned on with the switch at the top</span>
              </span>
              <ToggleSwitch enabled={modules.ECONOMY} onChange={(v) => setModule("ECONOMY", v)} label="Coins" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Coin amounts, /daily and multipliers are on <a className="text-neon-blue hover:underline" href={`/dashboard/${guildId}/economy/earning`}>Economy Earning</a>. The level-up message text and channel are on the{" "}
            <a className="text-neon-blue hover:underline" href={`/dashboard/${guildId}/leveling`}>Leaderboard</a> page ({levelChannel ? "a set channel" : "posts where the member chatted"}).
          </p>
        </Step>

        <Step n={2} title="Level-up moments" desc="Every level has its own color, from grey to gold, and level-ups come with rewards.">
          <div className="flex flex-wrap gap-1.5" aria-label="Level colors">
            {Array.from({ length: 50 }, (_, i) => i + 1).map((l) => (
              <span key={l} title={`Level ${l}`} className="w-5 h-5 rounded" style={{ background: levelColor(l) }} />
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Color each level-up message with its level's color</span>
            <ToggleSwitch enabled={s.levelColors} onChange={(v) => save({ levelColors: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Show a level-up card image (avatar, big level number, what's next)</span>
            <ToggleSwitch enabled={s.levelUpCard} onChange={(v) => save({ levelUpCard: v })} />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Coins for every level gained:</span>
            {sel(s.levelUpCoins, [0, 10, 25, 50, 100, 250, 500].map((n) => [n, n ? `${n}` : "None"] as [number, string]), (v) => save({ levelUpCoins: v }), "Coins per level")}
          </div>
        </Step>

        <Step n={3} title="Level role ladder" desc={`11 colored roles from Recruit to Spartan Legend. ${ladderLinked}/${LEVEL_LADDER.length} linked in this server.`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1">Level</th>
                  <th>Role</th>
                  <th>Color</th>
                  <th>XP total</th>
                  <th>Linked</th>
                </tr>
              </thead>
              <tbody>
                {LEVEL_LADDER.map((r) => (
                  <tr key={r.level} className="border-t border-white/5">
                    <td className="py-1.5">{r.level}</td>
                    <td className="font-semibold" style={{ color: r.color }}>
                      {r.name}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded" style={{ background: r.color }} />
                        <code className="text-xs text-slate-400">{r.color}</code>
                      </span>
                    </td>
                    <td className="text-slate-400">{xpForLevel(r.level).toLocaleString("en-US")}</td>
                    <td>{hub.levelRoles.some((l) => l.level === r.level) ? "✅" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-neon-blue/30 bg-neon-blue/5 p-3 text-sm">
            Run <code className="text-neon-blue">/levelroles</code> in your server. Spartacus creates all 11 roles with these names and colors, stacks them in order under its own role, and links each to its level. Run it again any time; it reuses roles that exist.
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Keep only the newest level role (so the name color always matches their level)</span>
            <ToggleSwitch enabled={s.keepTopLevelRole} onChange={(v) => save({ keepTopLevelRole: v })} />
          </label>
        </Step>

        <Step n={4} title="Reward Shop" desc="Things to spend coins on: roles, XP potions, crates, streak freezes, or anything staff hand out." on={s.shopEnabled} onToggle={(v) => save({ shopEnabled: v })}>
          <div className="space-y-2">
            {hub.items.length === 0 && (
              <p className="text-sm text-slate-400">
                No items yet.{" "}
                <button type="button" className="text-neon-blue hover:underline" onClick={async () => setHub(await api.addStarterShopItems(guildId))}>
                  Add 4 starter items
                </button>{" "}
                or make your own below.
              </p>
            )}
            {hub.items.map((it) => (
              <div key={it.id} className={`flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2.5 ${it.enabled ? "" : "opacity-50"}`}>
                <span className="text-lg w-7 text-center">{it.emoji.startsWith("<") ? "🛒" : it.emoji}</span>
                <span className="flex-1 min-w-0">
                  <b className="text-sm">{it.name}</b> <span className="text-xs text-slate-400">· {it.price.toLocaleString("en-US")} coins · {it.type === "ROLE" ? `role${it.durationDays ? ` for ${it.durationDays} days` : ""}` : it.type === "XP_BOOST" ? `${it.boostMult}x XP for ${it.boostMinutes} min` : it.type === "CRATE" ? `${CRATE_INFO[(it.crateRarity ?? "common") as CrateRarity].name} crate` : it.type === "STREAK_FREEZE" ? "streak freeze" : "staff hand out"}{it.stock !== null ? ` · ${it.stock} left` : ""}</span>
                  {it.description && <span className="block text-xs text-slate-500">{it.description}</span>}
                </span>
                <button type="button" className="text-xs text-slate-300 hover:text-white" onClick={() => { setDraft({ ...BLANK_ITEM, ...it, durationDays: it.durationDays, boostMult: it.boostMult ?? 2, boostMinutes: it.boostMinutes ?? 60, crateRarity: (it.crateRarity ?? "rare") as CrateRarity }); setEditing(true); }}>
                  Edit
                </button>
                <button type="button" className="text-xs text-rose-400 hover:text-rose-300" onClick={() => removeItem(it)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          {!editing ? (
            <button type="button" className="neon-button-sm" onClick={() => { setDraft(BLANK_ITEM); setEditing(true); }}>
              + Add an item
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 p-3 space-y-3">
              <p className="font-medium text-sm">{draft.id ? "Edit item" : "New item"}</p>
              <div className="grid sm:grid-cols-[160px_1fr_120px] gap-2">
                <EmojiPicker guildId={guildId} value={draft.emoji} onChange={(v) => setDraft({ ...draft, emoji: v || "🛒" })} popover placeholder="Emoji" />
                <input className={field} placeholder="Name, e.g. VIP Pass" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <input className={field} type="number" min={0} placeholder="Price" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} aria-label="Price" />
              </div>
              <input className={field} placeholder="Short description (optional)" value={draft.description} maxLength={120} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <div>
                <span className={label}>What it does</span>
                <select className={`${select} w-full`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ShopItemType })}>
                  {(Object.keys(SHOP_ITEM_TYPES) as ShopItemType[]).map((t) => (
                    <option key={t} value={t}>
                      {SHOP_ITEM_TYPES[t]}
                    </option>
                  ))}
                </select>
              </div>
              {draft.type === "ROLE" && (
                <div className="grid sm:grid-cols-2 gap-2 items-end">
                  <div>
                    <span className={label}>Role</span>
                    <RoleSelect guildId={guildId} value={draft.roleId} onChange={(id) => setDraft({ ...draft, roleId: id || null })} />
                  </div>
                  <div>
                    <span className={label}>For how long</span>
                    {sel(draft.durationDays ?? 0, [[0, "For good"], [1, "1 day"], [3, "3 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"]], (v) => setDraft({ ...draft, durationDays: v || null }), "Duration")}
                  </div>
                </div>
              )}
              {draft.type === "XP_BOOST" && (
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  {sel(draft.boostMult, [[1.5, "1.5x XP"], [2, "2x XP"], [3, "3x XP"]], (v) => setDraft({ ...draft, boostMult: v }), "Multiplier")}
                  <span>for</span>
                  {sel(draft.boostMinutes, [[30, "30 minutes"], [60, "1 hour"], [180, "3 hours"], [360, "6 hours"], [1440, "24 hours"]], (v) => setDraft({ ...draft, boostMinutes: v }), "Length")}
                </div>
              )}
              {draft.type === "CRATE" && sel(draft.crateRarity, CRATE_RARITIES.map((r) => [r, `${CRATE_INFO[r].emoji} ${CRATE_INFO[r].name} crate`] as [CrateRarity, string]), (v) => setDraft({ ...draft, crateRarity: v }), "Rarity")}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Stock:</span>
                {sel(draft.stock === null ? -1 : draft.stock, [[-1, "Unlimited"], [1, "1"], [5, "5"], [10, "10"], [25, "25"], [50, "50"], [100, "100"]], (v) => setDraft({ ...draft, stock: v < 0 ? null : v }), "Stock")}
                <label className="flex items-center gap-1.5 ml-auto">
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> For sale
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" className="neon-button-sm" onClick={saveItem}>
                  {draft.id ? "Save item" : "Add item"}
                </button>
                <button type="button" className="text-sm text-slate-400 hover:text-white" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div>
            <span className={label}>Shop log (purchases, and items staff hand out)</span>
            <ChannelSelect guildId={guildId} value={s.shopLogChannelId} onChange={(id) => save({ shopLogChannelId: id || null })} placeholder="No log" />
          </div>
          {hub.purchases.length > 0 && (
            <div>
              <span className={label}>Recent purchases</span>
              <ul className="text-xs text-slate-400 space-y-1">
                {hub.purchases.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    {new Date(p.createdAt).toLocaleString()} · {p.itemName} · {p.price.toLocaleString("en-US")} coins
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Step>

        <Step n={5} title="Shop panel" desc="An embed in a channel with Shop, My Crates, Daily and Balance buttons. No commands needed." on={!!hub.panel.channelId}>
          <div>
            <span className={label}>Channel</span>
            <ChannelSelect guildId={guildId} value={hub.panel.channelId} onChange={(id) => save({}, { ...hub.panel, channelId: id || null })} placeholder="No panel" />
          </div>
          {hub.panel.channelId && (
            <>
              <input className={field} placeholder="Title (leave blank for “🛒 Coins Shop”)" defaultValue={hub.panel.title} maxLength={256} onBlur={(e) => e.target.value !== hub.panel.title && save({}, { ...hub.panel, title: e.target.value })} />
              <textarea className={`${field} min-h-24`} placeholder="Message (leave blank for the default, which explains each button)" defaultValue={hub.panel.text} maxLength={4000} onBlur={(e) => e.target.value !== hub.panel.text && save({}, { ...hub.panel, text: e.target.value })} />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={hub.panel.posted ? "text-emerald-400" : "text-amber-300"}>{hub.panel.posted ? "● Posted" : "● Not posted yet"}</span>
                <button type="button" className="neon-button-sm ml-auto" onClick={() => save({}, hub.panel, true)}>
                  Repost panel
                </button>
              </div>
              {hub.panel.error && <p className="text-xs text-rose-400">{hub.panel.error}</p>}
              <p className="text-xs text-slate-500">Each button opens just for the person who pressed it, so the channel stays clean. Shop and My Crates follow the switches in steps 4 and 6.</p>
            </>
          )}
        </Step>

        <Step n={6} title="Loot crates" desc="Common, Rare, Epic and Legendary crates with a spinning reveal. Opened with /crates or the panel." on={s.cratesEnabled} onToggle={(v) => save({ cratesEnabled: v })}>
          <div className="grid sm:grid-cols-2 gap-2">
            {CRATE_RARITIES.map((r) => (
              <div key={r} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: CRATE_INFO[r].color + "55" }}>
                <b style={{ color: CRATE_INFO[r].color }}>
                  {CRATE_INFO[r].emoji} {CRATE_INFO[r].name}
                </b>
                <ul className="mt-1 text-slate-400">
                  {CRATE_TABLE[r].map(([chance, rw], i) => (
                    <li key={i}>
                      {chance}% · {rw.kind === "coins" ? `${rw.min.toLocaleString("en-US")}–${rw.max.toLocaleString("en-US")} coins` : rw.kind === "boost" ? `${rw.mult}x XP potion (${rw.minutes >= 60 ? rw.minutes / 60 + "h" : rw.minutes + "m"})` : rw.kind === "freeze" ? `${rw.count} streak freeze${rw.count > 1 ? "s" : ""}` : `a ${CRATE_INFO[rw.rarity].name} crate`}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>A crate every</span>
            {sel(s.crateEveryLevels, [[0, "never"], [1, "level"], [2, "2 levels"], [5, "5 levels"], [10, "10 levels"]], (v) => save({ crateEveryLevels: v }), "Crate every")}
            <span className="text-xs text-slate-500">(Common below 20, Rare from 20, Epic from 35, Legendary at 50)</span>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>A Rare crate for every 7 days of /daily in a row</span>
            <ToggleSwitch enabled={s.crateOnStreak} onChange={(v) => save({ crateOnStreak: v })} />
          </label>
          <div>
            <span className={label}>Announce Epic and Legendary pulls in</span>
            <ChannelSelect guildId={guildId} value={s.crateChannelId} onChange={(id) => save({ crateChannelId: id || null })} placeholder="Only where they're opened" />
          </div>
        </Step>

        <Step n={7} title="Voice XP" desc="XP every minute and coins every 10 minutes for people talking in voice." on={s.voiceXpEnabled} onToggle={(v) => save({ voiceXpEnabled: v })}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {sel(s.voiceXpPerMin, [1, 2, 3, 5, 8, 10, 15].map((n) => [n, `${n} XP`] as [number, string]), (v) => save({ voiceXpPerMin: v }), "XP per minute")}
            <span>per minute, and</span>
            {sel(s.voiceCoinsPer10, [0, 1, 2, 3, 5, 10, 20].map((n) => [n, n ? `${n} coins` : "no coins"] as [number, string]), (v) => save({ voiceCoinsPer10: v }), "Coins per 10 minutes")}
            <span>per 10 minutes</span>
          </div>
          <p className="text-xs text-slate-500">Only counts with at least 2 people in the channel, not muted or deafened, and not in the AFK channel, so it can't be farmed alone. Counted live every minute.</p>
        </Step>

        <Step n={8} title="XP events" desc="Double XP Weekends and a daily Happy Hour, announced automatically." on={s.weekendEnabled || s.happyEnabled}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Server time zone:</span>
            {sel(s.timezone, EVENT_TIMEZONES.map((t) => [t, t.replace("_", " ")] as [string, string]), (v) => save({ timezone: v }), "Time zone")}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              🎉 Weekend boost (Friday 6 PM to Sunday midnight):
              {sel(s.weekendMult, [[1.5, "1.5x"], [2, "2x"], [3, "3x"]], (v) => save({ weekendMult: v }), "Weekend multiplier")}
            </span>
            <ToggleSwitch enabled={s.weekendEnabled} onChange={(v) => save({ weekendEnabled: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              ⏰ Happy Hour every day at
              {sel(s.happyHour, Array.from({ length: 24 }, (_, h) => [h, `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`] as [number, string]), (v) => save({ happyHour: v }), "Happy hour")}
              {sel(s.happyMult, [[1.25, "1.25x"], [1.5, "1.5x"], [2, "2x"]], (v) => save({ happyMult: v }), "Happy hour multiplier")}
            </span>
            <ToggleSwitch enabled={s.happyEnabled} onChange={(v) => save({ happyEnabled: v })} />
          </label>
          <div>
            <span className={label}>Announce starts and ends in</span>
            <ChannelSelect guildId={guildId} value={s.eventChannelId} onChange={(id) => save({ eventChannelId: id || null })} placeholder="Don't announce" />
          </div>
          <p className="text-xs text-slate-500">Events multiply XP and message coins. They stack with the Stream Deck XP dial and personal potions.</p>
        </Step>

        <Step n={9} title="Prestige perks" desc="At the top, /prestige resets to level 0. Each prestige now gives a permanent bonus." on={s.prestigeBonusPct > 0}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Bonus XP and coins per prestige:</span>
            {sel(s.prestigeBonusPct, [[0, "None"], [5, "+5%"], [10, "+10%"], [15, "+15%"], [20, "+20%"], [25, "+25%"]], (v) => save({ prestigeBonusPct: v }), "Prestige bonus")}
            <span className="text-xs text-slate-500">(capped at +100%)</span>
          </div>
          <p className="text-xs text-slate-500">
            The max level and prestige role are on the <a className="text-neon-blue hover:underline" href={`/dashboard/${guildId}/prestige`}>Prestige</a> page.
          </p>
        </Step>

        <Step n={10} title="Weekly champions" desc="Every Monday at noon: last week's top members get a role for the week and a Rare crate." on={s.champsEnabled} onToggle={(v) => save({ champsEnabled: v })}>
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(CHAMP_CATEGORIES) as Array<keyof typeof CHAMP_CATEGORIES>).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.champsCategories.includes(c)} onChange={(e) => save({ champsCategories: e.target.checked ? [...s.champsCategories, c] : s.champsCategories.filter((x) => x !== c) })} />
                {CHAMP_CATEGORIES[c]}
              </label>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className={label}>Post them in</span>
              <ChannelSelect guildId={guildId} value={s.champsChannelId} onChange={(id) => save({ champsChannelId: id || null })} placeholder="Pick a channel" />
            </div>
            <div>
              <span className={label}>Champion role (moves to the new winners each week)</span>
              <RoleSelect guildId={guildId} value={s.champsRoleId} onChange={(id) => save({ champsRoleId: id || null })} placeholder="No role" />
            </div>
          </div>
          <p className="text-xs text-slate-500">Uses this server's time zone from step 8. Tracking starts when this is turned on, so the first post covers the first full week.</p>
        </Step>
      </div>
    </div>
  );
}
