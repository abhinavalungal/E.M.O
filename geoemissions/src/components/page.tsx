import Link from "next/link"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="border-b bg-card px-4 pt-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

const TONE_TEXT = { bad: "text-bad", warn: "text-warn", ok: "text-ok" }

/** KPI tile. Status is carried by the sub-line text colour + wording, never a decorative dot. */
export function StatTile({
  label,
  value,
  sub,
  href,
  tone,
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  href?: string
  tone?: "bad" | "warn" | "ok"
  className?: string
}) {
  const body = (
    <>
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-[22px] leading-none font-semibold tracking-tight text-foreground tabular">{value}</div>
      {sub && (
        <div className={cn("mt-2 text-xs", typeof sub === "string" && "truncate", tone ? TONE_TEXT[tone] : "text-muted-foreground")}>{sub}</div>
      )}
    </>
  )
  const cls = cn("block rounded-lg border bg-card px-4 py-3.5", className)
  return href ? (
    <Link
      href={href}
      className={cn(cls, "transition-colors outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/40")}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function SectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("flex flex-col rounded-lg border bg-card", className)}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  )
}

export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-sky hover:underline">
      {children}
    </Link>
  )
}

export function EmptyState({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <Icon className="size-7 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
