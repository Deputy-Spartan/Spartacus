"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type SocialsOverlaySettings, type SocialsPlatformId } from "../../../../lib/api";

const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40";
const small = "shrink-0 w-9 h-9 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-30";

// Tile color and logo for each platform, matching the overlay itself (public/overlays).
const PLATFORMS: Record<SocialsPlatformId, { label: string; bg: string; fg: string; d: string }> = {
  twitch: { label: "Twitch", bg: "#9146ff", fg: "#fff", d: "M4.3 2 2.5 6.6v13.6h5V23h2.8l2.8-2.8h4.2l5.6-5.6V2H4.3zm16 11.8-3.3 3.3h-5.2l-2.8 2.8v-2.8H4.6V4h15.7v9.8zM15.6 7.1h1.9v5.6h-1.9zm-5.2 0h1.9v5.6h-1.9z" },
  kick: { label: "Kick", bg: "#0b0b0b", fg: "#53fc18", d: "M3 3h6v5h2V6h2V4h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-1h-2v-2h-2v-2H9v5H3z" },
  youtube: { label: "YouTube", bg: "#ff0033", fg: "#fff", d: "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.75 15.02V8.98L15.5 12z" },
  tiktok: { label: "TikTok", bg: "#0b0b0b", fg: "#fff", d: "M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.3 6.2V8.6a8 8 0 0 0 4.7 1.5V6.8A4.8 4.8 0 0 1 16.6 2z" },
  x: { label: "X (Twitter)", bg: "#0b0b0b", fg: "#fff", d: "M18.2 2.3h3.4l-7.4 8.4 8.8 11h-6.8l-5.3-6.9-6.1 6.9H1.4l7.9-9L1 2.3h7l4.8 6.3 5.4-6.3zm-1.2 17.4h1.9L7.1 4.2H5.1z" },
  discord: { label: "Discord", bg: "#5865f2", fg: "#fff", d: "M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.4-5.3-.7-9.8-3.4-13.7zM8.5 15.4c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z" },
  instagram: { label: "Instagram", bg: "linear-gradient(45deg,#fdf497,#fd5949,#d6249f,#285aeb)", fg: "#fff", d: "M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.4-3.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" },
};

function Tile({ id, size = 36 }: { id: SocialsPlatformId; size?: number }) {
  const p = PLATFORMS[id];
  return (
    <span className="shrink-0 grid place-items-center rounded-[10px] border-2 border-white" style={{ width: size, height: size, background: p.bg, color: p.fg }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" width={size * 0.6} height={size * 0.6}>
        <path d={p.d} />
      </svg>
    </span>
  );
}

// The overlay page with these settings, for the preview (before saving).
function previewUrl(s: SocialsOverlaySettings) {
  const shown = s.platforms.filter((p) => p.on && p.name.trim());
  const q = new URLSearchParams({ preview: "1", show: shown.map((p) => p.id).join(","), pos: s.pos, size: String(s.size), hold: String(s.hold), every: "0" });
  for (const p of shown) q.set(p.id, p.name.trim());
  return `/overlays/${s.style === "gold" ? "gold" : "sticker"}.html?${q}`;
}

// Streaming › Socials Overlay: a lower third that shows your platform names on
// stream. OBS loads one link from this site, and it follows these settings.
export default function SocialsOverlayPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [s, setS] = useState<SocialsOverlaySettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    api
      .getSocialsOverlay(guildId)
      .then(setS)
      .catch(() => setFailed(true));
  }, [guildId]);

  const autoSave = useAutoSave(s, async () => {
    if (s) await api.saveSocialsOverlay(guildId, s);
  });

  // Keep the 1920x1080 preview fitted to its box.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1920);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [s === null]);

  // The preview catches up half a second after you stop typing, instead of
  // restarting on every letter.
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => setSrc(previewUrl(s)), src ? 500 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  if (failed) return <p className="text-rose-300">Couldn&apos;t load the overlay settings. Refresh the page to try again.</p>;
  if (!s) return <p className="text-slate-400">Loading…</p>;

  const update = (patch: Partial<SocialsOverlaySettings>) => setS({ ...s, ...patch });
  const setPlatform = (i: number, patch: Partial<SocialsOverlaySettings["platforms"][number]>) =>
    update({ platforms: s.platforms.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, by: number) => {
    const next = [...s.platforms];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    update({ platforms: next });
  };
  const shownCount = s.platforms.filter((p) => p.on && p.name.trim()).length;
  const missingName = s.platforms.some((p) => p.on && !p.name.trim());
  const obsLink = typeof window !== "undefined" ? `${window.location.origin}/overlay/socials/${guildId}` : "";

  const copy = () => {
    navigator.clipboard
      .writeText(obsLink)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => null);
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">🏷️ Socials Overlay</h1>
        <p className="text-slate-400 text-sm mt-1 max-w-2xl">
          A lower third that shows your names on Twitch, Kick, YouTube and more, so viewers can find you. Add it to OBS once. Changes here show on stream by themselves.
        </p>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <SaveStatus status={autoSave} />
      </div>

      <div className="space-y-4 max-w-4xl">
        <NeonCard>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <p className="font-medium">👀 Preview</p>
              <p className={hint}>The checkered part is see-through on stream.</p>
            </div>
            <button className={button} onClick={() => setPlayKey((k) => k + 1)}>
              ▶ Play again
            </button>
          </div>
          <div ref={box} className="relative w-full aspect-video overflow-hidden rounded-lg border border-white/10 bg-black">
            <iframe
              key={`${playKey}:${src}`}
              src={src || undefined}
              title="Socials overlay preview"
              className="absolute left-0 top-0 border-0 pointer-events-none"
              style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            />
          </div>
          {shownCount === 0 && <p className="text-xs text-amber-200 mt-2">Tick a platform and type your name below to see it.</p>}
        </NeonCard>

        <NeonCard>
          <p className="font-medium">📱 Platforms</p>
          <p className={`${hint} mb-3`}>
            Tick the ones to show and type your name on each. Platforms next to each other with the same name share one name. Use the arrows to change the order.
          </p>
          <ul className="space-y-2">
            {s.platforms.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-lg border border-white/10 p-2 ${p.on ? "" : "opacity-60"}`}>
                <input
                  type="checkbox"
                  className="w-5 h-5 shrink-0 accent-[rgb(var(--accent-rgb))]"
                  checked={p.on}
                  onChange={(e) => setPlatform(i, { on: e.target.checked })}
                  aria-label={`Show ${PLATFORMS[p.id].label}`}
                />
                <Tile id={p.id} />
                <input className={field} value={p.name} maxLength={40} placeholder={`Your ${PLATFORMS[p.id].label} name`} onChange={(e) => setPlatform(i, { name: e.target.value })} aria-label={`${PLATFORMS[p.id].label} name`} />
                <button className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${PLATFORMS[p.id].label} up`}>
                  ↑
                </button>
                <button className={small} disabled={i === s.platforms.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${PLATFORMS[p.id].label} down`}>
                  ↓
                </button>
              </li>
            ))}
          </ul>
          {missingName && <p className="text-xs text-amber-200 mt-2">A ticked platform with no name is skipped. Type a name to show it.</p>}
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
          <p className={`${hint} mb-3`}>One link. It keeps working when you change anything on this page.</p>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input className={`${field} font-mono text-xs`} value={obsLink} readOnly onFocus={(e) => e.target.select()} aria-label="OBS link" />
            <button className={`${button} shrink-0`} onClick={copy}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
            <li>In OBS: Sources → + → Browser.</li>
            <li>Untick Local file and paste the link into URL.</li>
            <li>Width 1920, Height 1080.</li>
            <li>Tick Shutdown source when not visible and Refresh browser when scene becomes active, so it pops in each time you show it.</li>
          </ol>
          <p className={`${hint} mt-3`}>After you change something here, the overlay on stream updates within about 20 seconds.</p>
        </NeonCard>
      </div>
    </div>
  );
}
