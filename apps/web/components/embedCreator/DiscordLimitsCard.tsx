import { DISCORD_LIMITS, type LimitReport } from "../../lib/discordLimits";
import { NeonCard } from "../ui/NeonCard";

// Live "will Discord accept this?" panel — the 6,000-character embed total
// as a meter, plus every rule the current message breaks, in plain words.
export function DiscordLimitsCard({ report }: { report: LimitReport }) {
  const max = DISCORD_LIMITS.embedTotal;
  const pct = Math.min(100, (report.embedChars / max) * 100);
  const over = report.embedChars > max;
  const barColor = over ? "bg-rose-500" : pct > 85 ? "bg-amber-400" : "bg-emerald-500";
  const errors = report.issues.filter((i) => i.level === "error");
  const warnings = report.issues.filter((i) => i.level === "warning");

  return (
    <NeonCard>
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm">Discord Limits</p>
        <span className={`text-[11px] font-mono ${over ? "text-rose-400" : "text-slate-500"}`}>
          {report.embedChars.toLocaleString()}/{max.toLocaleString()} embed characters
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>

      {errors.length === 0 && warnings.length === 0 && <p className="text-xs text-emerald-400">✓ Fits everything Discord allows — ready to send.</p>}

      {errors.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-rose-400 mb-1">⛔ Discord will reject this message:</p>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-rose-300 leading-snug">• {e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-300 leading-snug">⚠️ {w.message}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
        Discord counts title, description, field names/values, author and footer across <b className="text-slate-500">all</b> embeds toward one
        6,000 limit. Modules like Rules add their own button row, so keep at least one row free when using this there.
      </p>
    </NeonCard>
  );
}
