"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  COUNTER_COLORS,
  COUNTER_CORNERS,
  COUNTER_DSIZES,
  COUNTER_DSTYLES,
  COUNTER_FONTS,
  COUNTER_IDLES,
  COUNTER_LOOKS,
  COUNTER_OUTLINES,
  COUNTER_SPEEDS,
  COUNTER_SPOTS,
  COUNTER_VOLUMES,
  type AnimChoice,
  type CounterLook,
} from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { SaveStatus } from "../ui/SaveStatus";
import type { AutoSaveStatus } from "../../lib/useAutoSave";

// Streaming › Money Counter and K/D Counter: the parts both pages share.

export const hint = "text-xs text-slate-500";
export const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
export const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40";

// The OBS canvas: the box sits in the middle, with room for the +/- around it.
export const OBS_W = 1400;
export const OBS_H = 500;

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Lilita+One&family=Bangers&family=Russo+One&family=Black+Ops+One&family=Bebas+Neue&family=Luckiest+Guy&display=swap";

// A row of pick-one buttons.
export function Choices<T extends string | number>({
  title,
  items,
  value,
  onPick,
  cols = 3,
  render,
}: {
  title: ReactNode;
  items: ReadonlyArray<readonly [T, string, ...unknown[]]>;
  value: T;
  onPick: (v: T) => void;
  cols?: 2 | 3 | 4;
  render?: (item: readonly [T, string, ...unknown[]]) => ReactNode;
}) {
  const grid = cols === 4 ? "grid-cols-4" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className="mt-4">
      <p className="text-sm mb-1.5">{title}</p>
      <div className={`grid ${grid} gap-2`}>
        {items.map((item) => {
          const [id, name] = item;
          return (
            <button
              key={String(id)}
              type="button"
              onClick={() => onPick(id)}
              aria-pressed={value === id}
              className={`text-sm rounded-lg border px-1.5 py-2 transition-colors min-w-0 ${value === id ? "border-neon-blue bg-neon-blue/10 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/25"}`}
            >
              {render ? render(item) : name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The animation picker: bigger buttons with a line about each.
export function AnimChoices({ items, value, onPick }: { items: ReadonlyArray<AnimChoice>; value: string; onPick: (v: string) => void }) {
  return (
    <>
      <p className="text-sm mt-4 mb-1.5">Animation</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(([id, name, desc]) => (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-pressed={value === id}
            className={`text-left rounded-lg border p-2.5 transition-colors ${value === id ? "border-neon-blue bg-neon-blue/10" : "border-white/10 hover:border-white/25"}`}
          >
            <p className="font-semibold text-sm">
              {name} {value === id && <span className="text-neon-blue">✓</span>}
            </p>
            <p className={hint}>{desc}</p>
          </button>
        ))}
      </div>
    </>
  );
}

export const Swatch = ({ c }: { c: string }) => <span className="inline-block w-3 h-3 rounded-full border border-black mr-1 align-[-1px]" style={{ background: c }} />;
const pm = (
  <>
    <span className="text-emerald-300">+</span>/<span className="text-rose-300">−</span>
  </>
);

// The look options both counters have. `pick` saves and plays the animation once.
export function CommonLook<L extends CounterLook>({ look, pick, sounds, colorTitle = "Number color" }: { look: L; pick: (p: Partial<CounterLook>) => void; sounds: ReadonlyArray<readonly [string, string]>; colorTitle?: string }) {
  return (
    <>
      <Choices title={<>Where the {pm} shows</>} items={COUNTER_SPOTS} value={look.spot} onPick={(spot) => pick({ spot })} />
      <Choices title="Box look" cols={4} items={COUNTER_LOOKS} value={look.look} onPick={(v) => pick({ look: v })} />
      <Choices
        title="Font"
        items={COUNTER_FONTS}
        value={look.font}
        onPick={(font) => pick({ font })}
        render={([, name, family]) => <span style={{ fontFamily: `"${family}", sans-serif`, fontSize: 16 }}>{name}</span>}
      />
      <Choices title="Corners" items={COUNTER_CORNERS} value={look.corners} onPick={(corners) => pick({ corners })} />
      <Choices title="Outline" items={COUNTER_OUTLINES} value={look.outline} onPick={(outline) => pick({ outline })} />
      <Choices title="While nothing's happening" cols={4} items={COUNTER_IDLES} value={look.idle} onPick={(idle) => pick({ idle })} />
      <Choices
        title={colorTitle}
        cols={4}
        items={COUNTER_COLORS}
        value={look.color}
        onPick={(color) => pick({ color })}
        render={([c, name]) => (
          <>
            <Swatch c={c} />
            {name}
          </>
        )}
      />
      <Choices title={<>{pm} style</>} cols={2} items={COUNTER_DSTYLES} value={look.dstyle} onPick={(dstyle) => pick({ dstyle })} />
      <Choices title={<>{pm} size</>} items={COUNTER_DSIZES} value={look.dsize} onPick={(dsize) => pick({ dsize })} />
      <Choices title="Speed" items={COUNTER_SPEEDS} value={look.speed} onPick={(speed) => pick({ speed })} />
      <Choices title="Sound" cols={4} items={sounds} value={look.sound} onPick={(sound) => pick({ sound })} />
      {look.sound !== "off" && <Choices title="Volume" items={COUNTER_VOLUMES} value={look.volume} onPick={(volume) => pick({ volume })} />}
    </>
  );
}

// An on/off row.
export function Toggle({ on, onChange, name, desc }: { on: boolean; onChange: (v: boolean) => void; name: string; desc: string }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-white/10 p-2.5 cursor-pointer">
      <input type="checkbox" className="w-4 h-4 mt-0.5 accent-[rgb(var(--accent-rgb))]" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-sm font-medium block">{name}</span>
        <span className={hint}>{desc}</span>
      </span>
    </label>
  );
}

// The live preview: the real overlay in a frame, sent every change so it animates.
export function CounterPreview({
  kind,
  start,
  settings,
  values,
  status,
  frameRef,
  children,
}: {
  kind: "money" | "kd";
  start: Record<string, string>;
  settings: object;
  values: object;
  status: AutoSaveStatus;
  frameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [src] = useState(() => `/overlays/counter.html?${new URLSearchParams({ kind, preview: "1", ...start })}`);
  const send = () => frameRef.current?.contentWindow?.postMessage({ type: "counter", settings, values }, window.location.origin);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / OBS_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(send, [settings, values]);

  return (
    <NeonCard>
      <link rel="stylesheet" href={FONT_LINK} />
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="font-medium">👀 Preview</p>
          <p className={hint}>The checkered part is see-through on stream.</p>
        </div>
        <SaveStatus status={status} />
      </div>
      <div ref={box} className="relative overflow-hidden rounded-lg border border-white/10 bg-black w-full" style={{ aspectRatio: `${OBS_W} / ${OBS_H}` }}>
        <iframe
          ref={frameRef}
          src={src}
          onLoad={send}
          title="Overlay preview"
          className="absolute left-0 top-0 border-0 pointer-events-none"
          style={{ width: OBS_W, height: OBS_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
      </div>
      {children}
    </NeonCard>
  );
}

export const demoIn = (frame: HTMLIFrameElement | null, key: string, diff: number) => frame?.contentWindow?.postMessage({ type: "counter-demo", key, diff }, window.location.origin);

// The OBS link card.
export function ObsCard({ path, note }: { path: string; note?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}${path}` : "";
  return (
    <NeonCard>
      <p className="font-medium">🎥 Add it to OBS</p>
      <p className={`${hint} mb-3`}>One link. It keeps working when you change anything here.</p>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input className={`${field} font-mono text-xs`} value={link} readOnly onFocus={(e) => e.target.select()} aria-label="OBS link" />
        <button
          className={`${button} shrink-0`}
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => null)
          }
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
        <li>In OBS: Sources → + → Browser.</li>
        <li>Untick Local file and paste the link into URL.</li>
        <li>
          Set Width {OBS_W} and Height {OBS_H}.
        </li>
        <li>Drag it where you want it. Bigger? Use the Size slider here, not OBS, so it stays sharp.</li>
        <li>Using a sound? Tick Control audio via OBS so it plays in your stream.</li>
      </ol>
      {note}
    </NeonCard>
  );
}
