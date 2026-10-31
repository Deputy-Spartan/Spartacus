"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PAGE_GUIDES, type PageGuide } from "../../lib/pageGuides";

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-slate-300">
            <span className="text-slate-600 shrink-0" aria-hidden>
              •
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GuidePanel({ guide, onClose }: { guide: PageGuide; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close guide" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <aside role="dialog" aria-modal="true" aria-label={`${guide.title} guide`} className="relative h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-base-900 p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-500">Guide</p>
            <h2 className="text-xl font-bold break-words">{guide.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            Close
          </button>
        </div>
        <p className="text-sm text-slate-400">{guide.purpose}</p>
        {guide.before && <Block title="Before you start" items={guide.before} />}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Steps</h3>
          <ol className="space-y-2">
            {guide.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-slate-300">
                <span className="w-6 h-6 shrink-0 rounded-full bg-base-800 text-xs flex items-center justify-center text-neon-blue">{i + 1}</span>
                <span className="min-w-0 pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
        {guide.members && <Block title="In Discord" items={guide.members} />}
        {guide.tips && <Block title="Good to know" items={guide.tips} />}
      </aside>
    </div>
  );
}

// Shown on every dashboard page, so each one has its own step-by-step help.
export function PageGuideButton({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const key = pathname.split(`/dashboard/${guildId}`)[1]?.replace(/\/$/, "") ?? "";
  const guide = PAGE_GUIDES[key];

  useEffect(() => setOpen(false), [pathname]);
  if (!guide) return null;

  return (
    <>
      <div className="flex justify-end mb-3">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-white/10 bg-base-900 px-3 py-1.5 text-xs text-slate-300 hover:border-neon-blue hover:text-neon-blue">
          📖 Guide
        </button>
      </div>
      {open && <GuidePanel guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}
