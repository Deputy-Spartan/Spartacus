"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CANVAS_SIZES,
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
import { ToggleSwitch } from "../ui/ToggleSwitch";

// Streaming › Money Counter and K/D Counter: the parts both pages share.

export const hint = "text-xs text-slate-500";
export const field = "w-full min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
export const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40";

// The OBS canvas: the box sits in the middle, with room for the +/- around it.
export const OBS_W = 1400;
export const OBS_H = 500;

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Lilita+One&family=Bangers&family=Russo+One&family=Black+Ops+One&family=Bebas+Neue&family=Luckiest+Guy&family=Teko:wght@600&family=Barlow+Condensed:wght@700&family=Fredoka:wght@600&family=Permanent+Marker&display=swap";

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

// "#abc", "abc", "#AABBCC" or "aabbcc" → "#aabbcc"; anything else → null.
export function parseHex(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t.replace(/./g, (c) => c + c)}`;
  return null;
}

// A color picker with a box to type or paste a hex code (like #FFC641).
export function HexColor({ value, onChange, label, small }: { value: string; onChange: (c: string) => void; label: string; small?: boolean }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const bad = text.trim() !== "" && !parseHex(text);
  return (
    <span className="inline-flex items-center gap-1.5">
      <input type="color" aria-label={label} value={parseHex(value) ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} className={`${small ? "h-8 w-9" : "h-8 w-11"} rounded border border-white/10 bg-base-950 p-0.5 cursor-pointer shrink-0`} />
      <input
        aria-label={`${label} hex code`}
        value={text}
        maxLength={7}
        spellCheck={false}
        autoCapitalize="off"
        placeholder="#ffffff"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(value);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const c = parseHex(e.target.value);
          if (c && c !== value) onChange(c);
        }}
        className={`${small ? "w-[4.6rem]" : "w-[5.2rem]"} bg-base-950 border rounded-lg px-1.5 py-1.5 text-xs font-mono uppercase ${bad ? "border-rose-400/70" : "border-white/10"}`}
      />
    </span>
  );
}

// Color swatches plus your own hex code.
export function ColorChoices({ title, value, onPick }: { title: ReactNode; value: string; onPick: (c: string) => void }) {
  const custom = !COUNTER_COLORS.some(([c]) => c === value);
  return (
    <>
      <Choices
        title={title}
        cols={4}
        items={COUNTER_COLORS}
        value={value}
        onPick={onPick}
        render={([c, name]) => (
          <>
            <Swatch c={c} />
            {name}
          </>
        )}
      />
      <div className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${custom ? "border-neon-blue bg-neon-blue/10" : "border-white/10"}`}>
        <span className="text-sm text-slate-300 flex-1">Your own color {custom && <span className="text-neon-blue">✓</span>}</span>
        <HexColor label="Your own color" value={value} onChange={onPick} />
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
      <ColorChoices title={colorTitle} value={look.color} onPick={(color) => pick({ color })} />
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
      <ToggleSwitch size="sm" enabled={on} onChange={(v) => onChange(v)} />
      <span>
        <span className="text-sm font-medium block">{name}</span>
        <span className={hint}>{desc}</span>
      </span>
    </label>
  );
}

// Every overlay page: the options scroll on the left, the preview stays put
// on the right (on a phone it stays at the top while the options scroll under it).
export function EditorSplit({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
      <div className="lg:order-2 sticky top-14 sm:top-[68px] lg:top-20 z-[5] min-w-0 -mx-1 px-1 pt-1 bg-base-950/95 backdrop-blur lg:bg-transparent lg:backdrop-blur-none">{preview}</div>
      <div className="lg:order-1 space-y-4 min-w-0">{children}</div>
    </div>
  );
}

// The preview card: the real overlay page in a frame, scaled to fit.
export function PreviewPane({
  src,
  w,
  h,
  frameRef,
  onLoad,
  status,
  note = "The checkered part is see-through on stream.",
  children,
  canvas,
}: {
  src: string;
  w: number;
  h: number;
  frameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  onLoad?: () => void;
  status: AutoSaveStatus;
  note?: string;
  children?: ReactNode;
  canvas?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <NeonCard className="!p-3 sm:!p-4">
      <link rel="stylesheet" href={FONT_LINK} />
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-medium">👀 Preview</p>
          <p className={`${hint} hidden sm:block`}>{note}</p>
        </div>
        <SaveStatus status={status} />
      </div>
      <div ref={box} className="relative overflow-hidden rounded-lg border border-white/10 bg-black w-full mx-auto" style={{ aspectRatio: `${w} / ${h}`, maxHeight: "55vh", maxWidth: `calc(55vh * ${w / h})` }}>
        <iframe
          ref={frameRef}
          src={src}
          onLoad={onLoad}
          title="Overlay preview"
          className="absolute left-0 top-0 border-0 pointer-events-none"
          style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
      </div>
      {children}
      {canvas}
    </NeonCard>
  );
}

// The OBS browser source size: a few ready sizes, or type your own.
export function CanvasPicker({ w, h, sizes, onPick, note }: { w: number; h: number; sizes: ReadonlyArray<readonly [number, number, string]>; onPick: (w: number, h: number) => void; note: string }) {
  const commit = (nw: number, nh: number) => {
    if (Number.isFinite(nw) && Number.isFinite(nh) && nw >= 200 && nh >= 100 && nw <= 3840 && nh <= 2160 && (nw !== w || nh !== h)) onPick(Math.round(nw), Math.round(nh));
  };
  return (
    <details className="mt-3 rounded-lg border border-white/10 px-2.5 py-2">
      <summary className="text-sm cursor-pointer select-none">
        🖼️ Canvas size <span className="text-slate-400 tabular-nums">{w} × {h}</span>
      </summary>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
        {sizes.map(([sw, sh, name]) => (
          <button
            key={`${sw}x${sh}`}
            type="button"
            onClick={() => onPick(sw, sh)}
            aria-pressed={sw === w && sh === h}
            className={`text-sm rounded-lg border px-1.5 py-1.5 transition-colors min-w-0 ${sw === w && sh === h ? "border-neon-blue bg-neon-blue/10 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/25"}`}
          >
            {name}
            <span className="block text-[11px] text-slate-400 tabular-nums">
              {sw} × {sh}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input key={`w${w}`} className={`${field} !p-1.5 tabular-nums`} defaultValue={w} inputMode="numeric" aria-label="Canvas width" onBlur={(e) => commit(Number(e.target.value), h)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <span className="text-slate-400">×</span>
        <input key={`h${h}`} className={`${field} !p-1.5 tabular-nums`} defaultValue={h} inputMode="numeric" aria-label="Canvas height" onBlur={(e) => commit(w, Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </div>
      <p className={`${hint} mt-1.5`}>{note}</p>
    </details>
  );
}

// The live preview of a counter or box: the real overlay in a frame, sent every
// change so it animates. `before` and `after` go in the options column.
export function CounterPreview({
  kind,
  start,
  settings,
  values,
  status,
  frameRef,
  tryBar,
  before,
  after,
  onCanvas,
  children,
}: {
  kind: string;
  start: Record<string, string>;
  settings: object & { canvasW?: number; canvasH?: number };
  values: object;
  status: AutoSaveStatus;
  frameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  tryBar?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  onCanvas?: (w: number, h: number) => void;
  children?: ReactNode;
}) {
  const [src] = useState(() => `/overlays/counter.html?${new URLSearchParams({ kind, preview: "1", ...start })}`);
  const send = () => frameRef.current?.contentWindow?.postMessage({ type: "counter", settings, values }, window.location.origin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(send, [settings, values]);
  const w = settings.canvasW ?? OBS_W, h = settings.canvasH ?? OBS_H;

  return (
    <EditorSplit
      preview={
        <PreviewPane
          src={src}
          w={w}
          h={h}
          frameRef={frameRef}
          onLoad={send}
          status={status}
          canvas={onCanvas && <CanvasPicker w={w} h={h} sizes={CANVAS_SIZES} onPick={onCanvas} note="Use the same Width and Height in OBS. Smaller than 1400 × 500 shrinks it to fit. Bigger gives the animations more room." />}
        >
          {tryBar}
        </PreviewPane>
      }
    >
      {before}
      <NeonCard>
        <p className="font-medium">🎨 Look and animation</p>
        <p className={hint}>Each pick plays in the preview.</p>
        {children}
      </NeonCard>
      {after}
    </EditorSplit>
  );
}

export const demoIn = (frame: HTMLIFrameElement | null, key: string, diff: number) => frame?.contentWindow?.postMessage({ type: "counter-demo", key, diff }, window.location.origin);

// The OBS link card.
export function ObsCard({ path, note, w = OBS_W, h = OBS_H }: { path: string; note?: ReactNode; w?: number; h?: number }) {
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
          Set Width {w} and Height {h}.
        </li>
        <li>Drag it where you want it. Bigger? Use the Size slider here, not OBS, so it stays sharp.</li>
        <li>Using a sound? Tick Control audio via OBS so it plays in your stream.</li>
      </ol>
      {note}
    </NeonCard>
  );
}
