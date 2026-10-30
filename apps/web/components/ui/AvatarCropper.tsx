"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIEWPORT = 240; // on-screen crop box size, px
const OUTPUT = 512; // exported square image size, px

interface AvatarCropperProps {
  imageSrc: string;
  onCancel: () => void;
  onSave: (dataUri: string) => void;
}

// A from-scratch crop/zoom/reposition tool (no external cropper library) —
// drag to reposition, slider (or scroll wheel) to zoom, then bakes the
// visible square into a fixed-size PNG via canvas. Zoom is relative to a
// base "cover" scale so the image always fully fills the square at 1x,
// same behavior Discord's own avatar cropper has.
export function AvatarCropper({ imageSrc, onCancel, onSave }: AvatarCropperProps) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px, viewport-space, from centered
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
    imgRef.current = img;
  }, [imageSrc]);

  const baseScale = naturalSize ? Math.max(VIEWPORT / naturalSize.w, VIEWPORT / naturalSize.h) : 1;
  const scale = baseScale * zoom;
  const displayedW = naturalSize ? naturalSize.w * scale : VIEWPORT;
  const displayedH = naturalSize ? naturalSize.h * scale : VIEWPORT;

  const clamp = useCallback(
    (x: number, y: number) => {
      // Keep the image covering the whole viewport — no empty gaps at the edges.
      const maxX = Math.max(0, (displayedW - VIEWPORT) / 2);
      const maxY = Math.max(0, (displayedH - VIEWPORT) / 2);
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
    },
    [displayedW, displayedH]
  );

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp(dragRef.current.startOffsetX + dx, dragRef.current.startOffsetY + dy));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(1, z - e.deltaY * 0.001)));
  }

  // Re-clamp whenever zoom changes, in case the old offset would now reveal a gap.
  useEffect(() => {
    setOffset((prev) => clamp(prev.x, prev.y));
  }, [zoom, clamp]);

  function save() {
    const img = imgRef.current;
    if (!img || !naturalSize) return;

    const imageLeft = (VIEWPORT - displayedW) / 2 + offset.x;
    const imageTop = (VIEWPORT - displayedH) / 2 + offset.y;
    const sx = -imageLeft / scale;
    const sy = -imageTop / scale;
    const sSize = VIEWPORT / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div className="bg-base-900 border border-white/10 rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <p className="font-medium mb-1">Adjust Avatar</p>
        <p className="text-xs text-slate-500 mb-4">Drag to reposition, scroll or use the slider to zoom.</p>

        <div
          className="mx-auto rounded-full overflow-hidden bg-base-950 border border-white/10 cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          {naturalSize && (
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="pointer-events-none"
              style={{
                width: displayedW,
                height: displayedH,
                // Tailwind's preflight sets `img { max-width: 100%; height: auto }`
                // globally — without overriding both here, the browser caps the
                // image's rendered width at the 240px viewport while height stays
                // at the full computed value once zoomed past 1x, squishing it.
                maxWidth: "none",
                maxHeight: "none",
                transform: `translate(${(VIEWPORT - displayedW) / 2 + offset.x}px, ${(VIEWPORT - displayedH) / 2 + offset.y}px)`,
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(2))))}
            disabled={zoom <= 1}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-base-800 border border-white/10 text-slate-300 hover:bg-base-700 hover:text-white disabled:opacity-30 disabled:hover:bg-base-800 transition-colors"
            aria-label="Zoom out"
          >
            −
          </button>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="neon-slider"
            style={{ "--slider-fill": `${((zoom - 1) / 2) * 100}%` } as React.CSSProperties}
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
            disabled={zoom >= 3}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-base-800 border border-white/10 text-slate-300 hover:bg-base-700 hover:text-white disabled:opacity-30 disabled:hover:bg-base-800 transition-colors"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className="shrink-0 w-10 text-right text-xs tabular-nums text-slate-500">{Math.round(((zoom - 1) / 2) * 100)}%</span>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 bg-base-800 border border-white/10 rounded-lg py-2 text-sm text-slate-300 hover:bg-base-700">
            Cancel
          </button>
          <button onClick={save} disabled={!naturalSize} className="neon-button flex-1 disabled:opacity-50">
            Use This
          </button>
        </div>
      </div>
    </div>
  );
}
