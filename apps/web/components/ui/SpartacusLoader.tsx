"use client";

// The animated S used while signing in and while the dashboard opens.
export function SpartacusMark() {
  return (
    <div className="sp-mark" role="img" aria-label="Spartacus">
      <div className="sp-mark-glow" />
      <div className="sp-mark-s" />
      <div className="sp-mark-shine" />
    </div>
  );
}

// A full screen with the mark, a short line of text and the sliding bar.
export function SpartacusLoader({ label, note }: { label: string; note?: string }) {
  return (
    <main className="min-h-screen bg-base-950 flex flex-col items-center justify-center gap-4 px-4 text-center" aria-busy="true">
      <SpartacusMark />
      <p className="text-sm text-slate-300">{label}</p>
      <div className="sp-mark-bar" />
      {note && <p className="text-xs text-slate-500 max-w-xs">{note}</p>}
    </main>
  );
}
