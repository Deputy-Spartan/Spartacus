"use client";

import { useEffect, useRef, useState } from "react";
import { SOCIAL_PLATFORMS, SOCIALS_POST_DEFAULTS, socialUrl } from "@spartacus/shared";
import { NeonCard } from "../../../../../components/ui/NeonCard";
import { SaveStatus } from "../../../../../components/ui/SaveStatus";
import { ChannelSelect } from "../../../../../components/ui/ChannelSelect";
import { PageGuideButton } from "../../../../../components/nav/PageGuideButton";
import { ShowOnStream } from "../../../../../components/streaming/ShowOnStream";
import { useAutoSave } from "../../../../../lib/useAutoSave";
import { api, type SocialsOverlaySettings, type SocialsPlatformId } from "../../../../../lib/api";

const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40";
const small = "shrink-0 w-9 h-9 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-30";

// Tile color and logo for each platform, matching the overlay (public/overlays)
// and the bot's emojis (apps/bot/assets/socials).
const ICONS: Record<SocialsPlatformId, { bg: string; fg: string; d: string }> = {
  twitch: { bg: "#9146ff", fg: "#fff", d: "M4.3 2 2.5 6.6v13.6h5V23h2.8l2.8-2.8h4.2l5.6-5.6V2H4.3zm16 11.8-3.3 3.3h-5.2l-2.8 2.8v-2.8H4.6V4h15.7v9.8zM15.6 7.1h1.9v5.6h-1.9zm-5.2 0h1.9v5.6h-1.9z" },
  kick: { bg: "#0b0b0b", fg: "#53fc18", d: "M3 3h6v5h2V6h2V4h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-1h-2v-2h-2v-2H9v5H3z" },
  youtube: { bg: "#ff0033", fg: "#fff", d: "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.75 15.02V8.98L15.5 12z" },
  tiktok: { bg: "#0b0b0b", fg: "#fff", d: "M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.3 6.2V8.6a8 8 0 0 0 4.7 1.5V6.8A4.8 4.8 0 0 1 16.6 2z" },
  x: { bg: "#0b0b0b", fg: "#fff", d: "M18.2 2.3h3.4l-7.4 8.4 8.8 11h-6.8l-5.3-6.9-6.1 6.9H1.4l7.9-9L1 2.3h7l4.8 6.3 5.4-6.3zm-1.2 17.4h1.9L7.1 4.2H5.1z" },
  discord: { bg: "#5865f2", fg: "#fff", d: "M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.4-5.3-.7-9.8-3.4-13.7zM8.5 15.4c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z" },
  instagram: { bg: "linear-gradient(45deg,#fdf497,#fd5949,#d6249f,#285aeb)", fg: "#fff", d: "M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.4-3.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" },
};

function Tile({ id, size = 36, radius = 10 }: { id: SocialsPlatformId; size?: number; radius?: number }) {
  const p = ICONS[id];
  return (
    <span className="shrink-0 inline-grid place-items-center border-2 border-white align-middle" style={{ width: size, height: size, borderRadius: radius, background: p.bg, color: p.fg }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" width={size * 0.6} height={size * 0.6}>
        <path d={p.d} />
      </svg>
    </span>
  );
}

// The overlay page with these settings, for the preview (before saving).
// tall = the 1080x1920 (TikTok) version, with the names stacked.
function previewUrl(s: SocialsOverlaySettings, tall: boolean) {
  const shown = s.platforms.filter((p) => p.on && p.name.trim());
  const q = new URLSearchParams({ preview: "1", show: shown.map((p) => p.id).join(","), pos: s.pos, size: String(s.size), hold: String(s.hold), every: "0" });
  if (tall) q.set("vert", "1");
  for (const p of shown) q.set(p.id, p.name.trim());
  return `/overlays/${s.style === "gold" ? "gold" : "sticker"}.html?${q}`;
}

type Tab = "names" | "stream" | "discord";
const TABS: Array<[Tab, string]> = [
  ["names", "📱 Your names"],
  ["stream", "🎥 On stream"],
  ["discord", "💬 Discord post"],
];

// Streaming › Socials: your platform names, shown on stream as an OBS lower
// third and posted in Discord as one clean message.
export default function SocialsPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [s, setS] = useState<SocialsOverlaySettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("names");
  const [copied, setCopied] = useState<"" | "wide" | "tall">("");
  const [tall, setTall] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [posting, setPosting] = useState<"" | "post" | "remove">("");
  const [postMsg, setPostMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  useEffect(() => {
    api
      .getSocialsOverlay(guildId)
      .then(setS)
      .catch(() => setFailed(true));
  }, [guildId]);

  const autoSave = useAutoSave(s, async () => {
    if (s) await api.saveSocialsOverlay(guildId, s);
  });

  // Keep the 1920x1080 (or 1080x1920) preview fitted to its box.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / (tall ? 1080 : 1920));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [s === null, tab, tall]);

  // The preview catches up half a second after you stop typing, instead of
  // restarting on every letter.
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => setSrc(previewUrl(s, tall)), src ? 500 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, tall]);

  if (failed) return <p className="text-rose-300">Couldn&apos;t load the socials settings. Refresh the page to try again.</p>;
  if (!s) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<SocialsOverlaySettings>) => setS({ ...s, ...patch });
  const setPlatform = (i: number, patch: Partial<SocialsOverlaySettings["platforms"][number]>) =>
    update({ platforms: s.platforms.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, by: number) => {
    const next = [...s.platforms];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    update({ platforms: next });
  };
  // Tap-to-toggle chips for one list (stream or post). Each list is separate,
  // so e.g. Discord can be on stream but left out of the Discord post.
  const picker = (key: "on" | "post", label: string, sub: string) => {
    const named = s.platforms.map((p, i) => ({ p, i })).filter(({ p }) => p.name.trim());
    return (
      <NeonCard>
        <p className="font-medium">{label}</p>
        <p className={`${hint} mb-3`}>{sub}</p>
        {named.length === 0 ? (
          <p className="text-xs text-amber-200">Type your names in Your names first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {named.map(({ p, i }) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(i, { [key]: !p[key] })}
                aria-pressed={p[key]}
                className={`flex items-center gap-2 text-sm pl-1.5 pr-3 py-1.5 rounded-full border transition-colors ${p[key] ? "border-neon-blue bg-neon-blue/15 text-white" : "border-white/10 text-slate-500 opacity-60 hover:opacity-100"}`}
              >
                <Tile id={p.id} size={22} radius={6} />
                {SOCIAL_PLATFORMS[p.id].label}
                <span className="text-xs">{p[key] ? "✓" : "off"}</span>
              </button>
            ))}
          </div>
        )}
      </NeonCard>
    );
  };
  const onStream = s.platforms.filter((p) => p.on && p.name.trim());
  const inPost = s.platforms.filter((p) => p.post && p.name.trim());
  const title = s.postTitle?.trim() || SOCIALS_POST_DEFAULTS.title;
  const text = s.postText ?? SOCIALS_POST_DEFAULTS.text;
  const obsLink = typeof window !== "undefined" ? `${window.location.origin}/overlay/socials/${guildId}` : "";
  const links = [
    { id: "wide" as const, label: "📺 Wide (normal stream)", size: "Width 1920, Height 1080.", url: obsLink },
    { id: "tall" as const, label: "📱 Tall (TikTok / vertical)", size: "Width 1080, Height 1920. Add it to your vertical scenes.", url: `${obsLink}?vert=1` },
  ];

  const copy = (which: "wide" | "tall", url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(which);
        setTimeout(() => setCopied(""), 1500);
      })
      .catch(() => null);
  };

  async function post() {
    if (!s) return;
    setPosting("post");
    setPostMsg(null);
    try {
      await api.saveSocialsOverlay(guildId, s); // post exactly what's on screen
      const r = await api.postSocials(guildId);
      setS(r.settings);
      setPostMsg({ ok: true, text: s.posted ? "Post updated." : "Posted.", url: r.url });
    } catch (err) {
      setPostMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't post. Try again." });
    } finally {
      setPosting("");
    }
  }

  async function remove() {
    setPosting("remove");
    setPostMsg(null);
    try {
      setS(await api.removeSocialsPost(guildId));
      setPostMsg({ ok: true, text: "Post removed from Discord." });
    } catch (err) {
      setPostMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't remove it. Try again." });
    } finally {
      setPosting("");
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">🏷️ Socials</h1>
          <p className="text-slate-400 text-sm mt-1">Your names in one place. Show them on stream and post them in Discord.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ShowOnStream guildId={guildId} id="socials" />
          <PageGuideButton guildId={guildId} inline />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${tab === id ? "border-neon-blue bg-neon-blue/15 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/30"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto">
          <SaveStatus status={autoSave} />
        </span>
      </div>

      <div className="space-y-4">
        {tab === "names" && (
          <NeonCard>
            <p className="font-medium">📱 Your names</p>
            <p className={`${hint} mb-3`}>
              Type your name, and a link if you want one. <b>Stream</b> shows it on the overlay, <b>Post</b> puts it in the Discord post. Arrows change the order.
            </p>
            <ul className="space-y-2">
              {s.platforms.map((p, i) => {
                const meta = SOCIAL_PLATFORMS[p.id];
                return (
                  <li key={p.id} className="rounded-lg border border-white/10 p-2">
                    <div className="flex items-center gap-2">
                      <Tile id={p.id} />
                      <input className={field} value={p.name} maxLength={60} placeholder={meta.placeholder} onChange={(e) => setPlatform(i, { name: e.target.value })} aria-label={`${meta.label} name`} />
                      <button className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${meta.label} up`}>
                        ↑
                      </button>
                      <button className={small} disabled={i === s.platforms.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${meta.label} down`}>
                        ↓
                      </button>
                    </div>
                    <div className="mt-2 pl-11">
                      <input
                        className={`${field} text-xs`}
                        value={p.url ?? ""}
                        maxLength={300}
                        placeholder="🔗 Link (optional)"
                        onChange={(e) => setPlatform(i, { url: e.target.value })}
                        aria-label={`${meta.label} link`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 pl-11 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--accent-rgb))]" checked={p.on} onChange={(e) => setPlatform(i, { on: e.target.checked })} />
                        Stream
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--accent-rgb))]" checked={p.post} onChange={(e) => setPlatform(i, { post: e.target.checked })} />
                        Post
                      </label>
                      {p.name.trim() && <span className={`${hint} truncate`}>Opens {socialUrl(p.id, p.name, p.url).replace(/^https?:\/\//, "")}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className={`${hint} mt-3`}>
              No link? One is made from your name. For Discord, type your invite code (the part after discord.gg/). Platforms with no name are skipped.
            </p>
          </NeonCard>
        )}

        {tab === "stream" && (
          <>
            {picker("on", "📺 What shows on stream", "Tap to turn one on or off. This doesn't change the Discord post.")}
            <NeonCard>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <p className="font-medium">👀 Preview</p>
                  <p className={hint}>The checkered part is see-through on stream.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      [false, "📺 Wide"],
                      [true, "📱 Tall"],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={label} type="button" onClick={() => setTall(v)} aria-pressed={tall === v} className={`${button} ${tall === v ? "border-neon-blue bg-neon-blue/15 text-white" : ""}`}>
                      {label}
                    </button>
                  ))}
                  <button className={button} onClick={() => setPlayKey((k) => k + 1)}>
                    ▶ Play again
                  </button>
                </div>
              </div>
              <div ref={box} className={`relative overflow-hidden rounded-lg border border-white/10 bg-black ${tall ? "w-full max-w-[280px] mx-auto aspect-[9/16]" : "w-full aspect-video"}`}>
                <iframe
                  key={`${playKey}:${src}`}
                  src={src || undefined}
                  title="Socials overlay preview"
                  className="absolute left-0 top-0 border-0 pointer-events-none"
                  style={{ width: tall ? 1080 : 1920, height: tall ? 1920 : 1080, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                />
              </div>
              {tall && <p className={`${hint} mt-2 text-center`}>Names stack one per line, up near the top so TikTok&apos;s comments don&apos;t cover them.</p>}
              {onStream.length === 0 && <p className="text-xs text-amber-200 mt-2">Tick Stream on a platform in Your names and type its name to see it.</p>}
            </NeonCard>

            <NeonCard>
              <p className="font-medium mb-3">🎨 Look</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {(
                  [
                    ["sticker", "Sticker", "App icons and your name in big outlined letters, all in one row."],
                    ["gold", "Gold bar", "A gold and black bar, one platform at a time."],
                  ] as const
                ).map(([id, name, desc]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ style: id })}
                    aria-pressed={s.style === id}
                    className={`text-left rounded-lg border p-3 transition-colors ${s.style === id ? "border-neon-blue bg-neon-blue/10" : "border-white/10 hover:border-white/25"}`}
                  >
                    <p className="font-semibold text-sm">
                      {name} {s.style === id && <span className="text-neon-blue">✓</span>}
                    </p>
                    <p className={hint}>{desc}</p>
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Where on screen</span>
                  <select className={`${field} mt-1`} value={s.pos} onChange={(e) => update({ pos: e.target.value as SocialsOverlaySettings["pos"] })}>
                    <option value="left">Bottom left</option>
                    <option value="center">Bottom middle</option>
                    <option value="right">Bottom right</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm">Size: {s.size}%</span>
                  <input type="range" className="w-full mt-3" min={30} max={200} step={5} value={s.size} onChange={(e) => update({ size: Number(e.target.value) })} />
                </label>
                <label className="block">
                  <span className="text-sm">Stays up for (seconds)</span>
                  <input type="number" className={`${field} mt-1`} min={0} max={600} value={s.hold} onChange={(e) => update({ hold: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className={hint}>{s.style === "gold" ? "How long each platform shows." : "0 = stays until you hide it in OBS."}</span>
                </label>
                <label className="block">
                  <span className="text-sm">Comes back every (minutes)</span>
                  <input type="number" className={`${field} mt-1`} min={0} max={120} value={s.every} onChange={(e) => update({ every: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className={hint}>0 = plays once each time you show it.</span>
                </label>
              </div>
            </NeonCard>

            <NeonCard>
              <p className="font-medium">🎥 Add it to OBS</p>
              <p className={`${hint} mb-3`}>One link for your normal stream, one for vertical (TikTok). Both keep working when you change anything on this page.</p>
              <div className="space-y-3 mb-4">
                {links.map((l) => (
                  <div key={l.id}>
                    <p className="text-sm mb-1">
                      {l.label} <span className={hint}>{l.size}</span>
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input className={`${field} font-mono text-xs`} value={l.url} readOnly onFocus={(e) => e.target.select()} aria-label={`${l.label} OBS link`} />
                      <button className={`${button} shrink-0`} onClick={() => copy(l.id, l.url)}>
                        {copied === l.id ? "Copied ✓" : "Copy link"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
                <li>In OBS: Sources → + → Browser.</li>
                <li>Untick Local file and paste the link into URL.</li>
                <li>Set the width and height shown above the link.</li>
                <li>Tick Shutdown source when not visible and Refresh browser when scene becomes active, so it pops in each time you show it.</li>
              </ol>
              <p className={`${hint} mt-3`}>After you change something here, the overlay on stream updates within about 20 seconds.</p>
            </NeonCard>
          </>
        )}

        {tab === "discord" && (
          <>
            <NeonCard>
              <p className="font-medium mb-3">💬 Discord post</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {(
                  [
                    ["embed", "Embed", "A card with a gold edge and your server icon."],
                    ["plain", "Plain", "A normal message with a big heading, one line each."],
                  ] as const
                ).map(([id, name, desc]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ postStyle: id })}
                    aria-pressed={s.postStyle === id}
                    className={`text-left rounded-lg border p-3 transition-colors ${s.postStyle === id ? "border-neon-blue bg-neon-blue/10" : "border-white/10 hover:border-white/25"}`}
                  >
                    <p className="font-semibold text-sm">
                      {name} {s.postStyle === id && <span className="text-neon-blue">✓</span>}
                    </p>
                    <p className={hint}>{desc}</p>
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm mb-1">Channel</p>
                  <ChannelSelect guildId={guildId} value={s.postChannelId} onChange={(id) => update({ postChannelId: id || null })} placeholder="Pick a channel" />
                </div>
                <label className="block">
                  <span className="text-sm">Heading</span>
                  <input className={`${field} mt-1`} value={s.postTitle ?? ""} maxLength={256} placeholder={SOCIALS_POST_DEFAULTS.title} onChange={(e) => update({ postTitle: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-sm">Line of text</span>
                  <input className={`${field} mt-1`} value={s.postText ?? SOCIALS_POST_DEFAULTS.text} maxLength={300} placeholder="Leave empty for none" onChange={(e) => update({ postText: e.target.value })} />
                </label>
              </div>
            </NeonCard>

            {picker("post", "📋 What's in the post", "Tap to turn one on or off. This doesn't change your stream overlay. Tip: leave Discord off when posting in your own server.")}

            <NeonCard>
              <p className="font-medium">👀 How it looks in Discord</p>
              <p className={`${hint} mb-3`}>Names and order come from Your names.</p>
              <div className="rounded-lg bg-[#313338] p-3 sm:p-4 text-[#dbdee1] text-sm">
                <div className="flex gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-[#111] bg-[url('/logo-mark.png')] bg-[length:80%] bg-center bg-no-repeat" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <b className="text-[#f2f3f5] font-semibold">Spartacus</b>
                      <span className="bg-[#5865f2] text-white text-[10px] font-bold px-1 rounded">✓ APP</span>
                      <span className="text-[#949ba4] text-xs">Today</span>
                    </p>
                    {inPost.length === 0 ? (
                      <p className="text-amber-200 text-xs mt-2">Turn on at least one platform in What&apos;s in the post.</p>
                    ) : s.postStyle === "embed" ? (
                      <div className="mt-1.5 max-w-lg rounded border-l-4 border-[#e0a91e] bg-[#2b2d31] p-3 pr-4">
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[#f2f3f5] text-base">{title}</p>
                            {text.trim() && <p className="mt-1">{text}</p>}
                          </div>
                          <div className="w-16 h-16 shrink-0 rounded-lg bg-[#111] bg-[url('/logo-mark.png')] bg-[length:78%] bg-center bg-no-repeat" aria-hidden="true" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2.5 mt-3">
                          {inPost.map((p) => (
                            <div key={p.id} className="min-w-0">
                              <p className="flex items-center gap-1.5 font-bold text-[#f2f3f5]">
                                <Tile id={p.id} size={20} radius={6} />
                                {SOCIAL_PLATFORMS[p.id].label}
                              </p>
                              <p className="text-[#00a8fc] truncate mt-0.5">{p.id === "discord" ? "Join the server" : p.name}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-[#949ba4] mt-3">Your server name</p>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <p className="text-xl font-extrabold text-[#f2f3f5] my-1">{title}</p>
                        {inPost.map((p) => (
                          <p key={p.id} className="flex flex-wrap items-center gap-1.5 py-0.5">
                            <Tile id={p.id} size={20} radius={6} />
                            <b className="text-[#f2f3f5]">{SOCIAL_PLATFORMS[p.id].label}</b>
                            <span className="text-[#949ba4]">・</span>
                            <span className="text-[#00a8fc] break-all">{socialUrl(p.id, p.name, p.url)}</span>
                          </p>
                        ))}
                        {text.trim() && <p className="text-xs text-[#949ba4] mt-2">{text}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <button className="neon-button" disabled={!!posting || !s.postChannelId || inPost.length === 0} onClick={post}>
                  {posting === "post" ? "Posting…" : s.posted ? "Update post" : "Post in Discord"}
                </button>
                {s.posted && (
                  <button className={`${button} text-rose-300`} disabled={!!posting} onClick={remove}>
                    {posting === "remove" ? "Removing…" : "Remove post"}
                  </button>
                )}
                {!s.postChannelId && <span className={hint}>Pick a channel first.</span>}
              </div>
              {postMsg && (
                <p className={`text-sm mt-2 ${postMsg.ok ? "text-emerald-300" : "text-rose-300"}`}>
                  {postMsg.text}{" "}
                  {postMsg.url && (
                    <a href={postMsg.url} target="_blank" rel="noopener noreferrer" className="underline">
                      Open in Discord ›
                    </a>
                  )}
                </p>
              )}
              <p className={`${hint} mt-3`}>
                The icons are Spartacus&apos;s own emojis, so you don&apos;t need to upload anything. Changed a name? Press Update post and the same message is edited, no new post.
              </p>
            </NeonCard>
          </>
        )}
      </div>
    </div>
  );
}
