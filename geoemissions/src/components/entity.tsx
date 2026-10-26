// Pieces shared by Vessel 360 and Customer 360.
import Link from "next/link"
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Coins, FileCheck2, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtAgo, fmtDateTime } from "@/lib/format"
import type { TimelineEvent } from "@/lib/timeline"

const EV = {
  email_in: { icon: ArrowDownLeft, cls: "bg-sky-soft text-info" },
  email_out: { icon: ArrowUpRight, cls: "bg-brand-soft text-brand" },
  report: { icon: FileCheck2, cls: "bg-ok-soft text-ok" },
  missing: { icon: AlertTriangle, cls: "bg-bad-soft text-bad" },
  compliance: { icon: ShieldCheck, cls: "bg-warn-soft text-warn" },
  commercial: { icon: Coins, cls: "bg-muted text-foreground/70" },
}

export function Timeline({ events, limit }: { events: TimelineEvent[]; limit?: number }) {
  const list = limit ? events.slice(0, limit) : events
  return (
    <ol className="relative space-y-0.5">
      {list.map((e, i) => {
        const E = EV[e.kind]
        const body = (
          <>
            <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card", E.cls)}>
              <E.icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block text-[13px] leading-snug font-medium text-foreground first-letter:uppercase">{e.title}</span>
              {e.detail && <span className="block truncate text-xs text-muted-foreground">{e.detail}</span>}
            </span>
            <time className="shrink-0 pt-1 text-[11px] text-muted-foreground" title={fmtDateTime(e.at)}>
              {fmtAgo(e.at)}
            </time>
          </>
        )
        return (
          <li key={i} className="relative">
            {i < list.length - 1 && <span className="absolute top-8 bottom-0 left-[13.5px] w-px bg-border" aria-hidden />}
            {e.href ? (
              <Link href={e.href} className="flex gap-3 rounded-lg px-1 py-2 hover:bg-muted/50">
                {body}
              </Link>
            ) : (
              <div className="flex gap-3 px-1 py-2">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-foreground">{children}</dd>
    </div>
  )
}
