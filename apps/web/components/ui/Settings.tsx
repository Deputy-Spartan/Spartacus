"use client";

import { NeonCard } from "./NeonCard";
import { Icon } from "./AppIcon";

// The standard settings layout every module page is moving to: titled
// sections, each setting on one row with its label and a short explanation
// on the left and the control on the right (stacked on phones).

export function SettingsSection({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <NeonCard className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      <div className="mt-2 divide-y divide-white/5">{children}</div>
    </NeonCard>
  );
}

// A small ? that shows its text on hover (computer) or tap/focus (phone).
export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={text} className="text-slate-500 hover:text-neon-blue focus:text-neon-blue focus:outline-none rounded-full">
        <Icon name="circle-help" size={14} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-30 mb-2 hidden w-max max-w-[240px] -translate-x-1/2 rounded-lg bg-[#111214] px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-xl group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

export function SettingRow({
  label,
  help,
  tip,
  required,
  wide,
  children,
}: {
  label: string;
  help?: React.ReactNode; // the short line under the label
  tip?: string; // longer explanation in the ? tooltip
  required?: boolean;
  wide?: boolean; // the control gets the full width under the label (lists, long inputs)
  children: React.ReactNode;
}) {
  return (
    <div className={`py-3.5 grid gap-x-6 gap-y-2 ${wide ? "" : "sm:grid-cols-[minmax(0,1fr)_minmax(200px,320px)] sm:items-center"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium flex items-center gap-1.5">
          {label}
          {required && (
            <span className="text-amber-400" title="Required">
              *
            </span>
          )}
          {tip && <HelpTip text={tip} />}
        </p>
        {help && <p className="text-xs text-slate-500 mt-0.5">{help}</p>}
      </div>
      {/* ChannelSelect and friends bring their own bottom margin; rows don't need it. */}
      <div className="min-w-0 [&>div]:mb-0 [&>input]:mb-0 [&>select]:mb-0">{children}</div>
    </div>
  );
}

// A number box sized for a settings row.
export function NumberInput({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
    />
  );
}
