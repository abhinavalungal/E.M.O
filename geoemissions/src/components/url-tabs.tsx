import Link from "next/link"
import { cn } from "@/lib/utils"

/** Underline tabs driven by a ?tab= search param so every tab is linkable. */
export function UrlTabs({
  tabs,
  current,
  base,
  extra = "",
}: {
  tabs: { value: string; label: string; count?: number }[]
  current: string
  base: string
  extra?: string
}) {
  return (
    <nav className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={`${base}?tab=${t.value}${extra}`}
          scroll={false}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
            current === t.value ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}
