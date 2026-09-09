export function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4 bg-base-900 border border-white/5 rounded-lg px-4 py-3">
      <button onClick={onBack} className="text-slate-400 hover:text-neon-blue text-lg leading-none" title="Back">
        ←
      </button>
      <p className="font-semibold text-slate-100">{title}</p>
      <span className="w-4" />
    </div>
  );
}
