// CII rating system (IMO Carbon Intensity Indicator, A–E).
// Traffic-light scale (maritime convention): greens for superior, yellow for C (the required
// rating), orange → red for inferior. The letter is always printed, so colour is never the only cue.
import { cn } from "@/lib/utils"
import type { Vessel } from "@/lib/types"

type Rating = NonNullable<Vessel["cii2025"]>

export const CII: Record<Rating, { fill: string; text: string; label: string }> = {
  A: { fill: "#1a7f3c", text: "#ffffff", label: "Major superior" },
  B: { fill: "#7cbf4a", text: "#10231a", label: "Minor superior" },
  C: { fill: "#f2c94c", text: "#2b2821", label: "Moderate" },
  D: { fill: "#f2994a", text: "#2a1408", label: "Minor inferior" },
  E: { fill: "#d64545", text: "#ffffff", label: "Inferior" },
}
const RATINGS = Object.keys(CII) as Rating[]

/** Letter badge — tables, lists, cards. `withLabel` adds the IMO wording. */
export function CiiBadge({ rating, withLabel, className }: { rating?: Rating; withLabel?: boolean; className?: string }) {
  if (!rating) return <span className={cn("text-xs text-muted-foreground", className)} title="CII not recorded">—</span>
  const c = CII[rating]
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`CII ${rating} · ${c.label}`}>
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-[3px] text-[11px] font-semibold"
        style={{ background: c.fill, color: c.text }}
      >
        {rating}
      </span>
      {withLabel && <span className="text-[12px] text-muted-foreground">{c.label}</span>}
    </span>
  )
}

/** Full A–E scale with the vessel's rating marked — vessel details. */
export function CiiScale({ rating, year = 2025 }: { rating?: Rating; year?: number }) {
  if (!rating) return <span className="text-[13px] text-muted-foreground">CII {year} not recorded</span>
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-end gap-0.5" role="img" aria-label={`CII ${year}: ${rating}, ${CII[rating].label}`}>
        {RATINGS.map((r) => (
          <span
            key={r}
            className={cn(
              "flex w-6 items-center justify-center rounded-[3px] text-[10px] font-semibold transition-none",
              r === rating ? "h-6 ring-2 ring-foreground ring-offset-1 ring-offset-card" : "h-4 opacity-40",
            )}
            style={{ background: CII[r].fill, color: CII[r].text }}
          >
            {r}
          </span>
        ))}
      </div>
      <span className="leading-tight">
        <span className="block text-[13px] font-semibold text-foreground">
          {rating} · {CII[rating].label}
        </span>
        <span className="block text-[11px] text-muted-foreground">Attained CII {year}</span>
      </span>
    </div>
  )
}

/** Fleet distribution — dashboards and KPI tiles. */
export function CiiDistribution({ ratings, compact }: { ratings: (Rating | undefined)[]; compact?: boolean }) {
  const counts = RATINGS.map((r) => ({ r, n: ratings.filter((x) => x === r).length }))
  return (
    <div className="space-y-2">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-sm" role="img" aria-label={counts.map((c) => `${c.r}: ${c.n}`).join(", ")}>
        {counts
          .filter((c) => c.n > 0)
          .map((c) => (
            <span key={c.r} style={{ flex: c.n, background: CII[c.r].fill }} title={`${c.r} · ${CII[c.r].label}: ${c.n}`} />
          ))}
      </div>
      <div className={cn("flex flex-wrap gap-x-3 gap-y-1", compact ? "text-[11px]" : "text-xs")}>
        {counts.map((c) => (
          <span key={c.r} className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ background: CII[c.r].fill }} aria-hidden />
            <span className="font-medium text-foreground">{c.r}</span>
            <span className="tabular">{c.n}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
