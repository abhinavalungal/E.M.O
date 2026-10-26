// Small status/identity atoms shared by every screen. Status colors always ship with an icon + label.
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Eye,
  FileText,
  FileSpreadsheet,
  File,
  Hourglass,
  Minus,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORIES } from "@/lib/data"
import { useStore } from "@/lib/store"
import type { Attachment, Category, ComplianceStatus, Group, Priority, Status } from "@/lib/types"

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "brand"

const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand",
}

export function Pill({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  )
}

export const STATUS: Record<Status, { label: string; tone: Tone; icon: LucideIcon }> = {
  new: { label: "New", tone: "info", icon: CircleDot },
  open: { label: "Requires action", tone: "bad", icon: AlertTriangle },
  waiting_customer: { label: "Waiting · customer", tone: "warn", icon: Hourglass },
  waiting_internal: { label: "Waiting · internal", tone: "warn", icon: Hourglass },
  resolved: { label: "Resolved", tone: "ok", icon: CheckCircle2 },
}

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status]
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.label}
    </Pill>
  )
}

export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" }

/** Linear-style signal bars; urgent gets a filled red square. */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === "urgent")
    return (
      <span
        title="Urgent"
        className={cn("inline-flex size-3.5 items-center justify-center rounded-[3px] bg-bad text-[9px] font-bold text-white", className)}
      >
        !
      </span>
    )
  const filled = { high: 3, medium: 2, low: 1 }[priority]
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5", className)} aria-label={PRIORITY_LABEL[priority]} role="img">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 4.5}
          y={9 - i * 3.5}
          width={3}
          height={4 + i * 3.5}
          rx={1}
          className={i < filled ? "fill-foreground/70" : "fill-foreground/15"}
        />
      ))}
    </svg>
  )
}

/** Group dot colors match the chart series order so a category keeps its color everywhere. */
export const GROUP_COLOR: Record<Group, string> = {
  reports: "var(--chart-1)",
  commercial: "var(--chart-2)",
  regulatory: "var(--chart-3)",
  queries: "var(--chart-4)",
  other: "#94a3b8",
}

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  const c = CATEGORIES[category]
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border bg-card px-1.5 text-[11px] font-medium whitespace-nowrap text-foreground/80",
        className,
      )}
    >
      <span className="size-1.5 rounded-full" style={{ background: GROUP_COLOR[c.group] }} aria-hidden />
      {c.label}
    </span>
  )
}

export const COMPLIANCE: Record<ComplianceStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  complete: { label: "Complete", tone: "ok", icon: CheckCircle2 },
  submitted: { label: "Submitted", tone: "info", icon: Send },
  in_progress: { label: "In progress", tone: "neutral", icon: CircleDashed },
  review: { label: "Review", tone: "warn", icon: Eye },
  action_required: { label: "Action required", tone: "bad", icon: AlertTriangle },
  overdue: { label: "Overdue", tone: "bad", icon: XCircle },
  na: { label: "N/A", tone: "neutral", icon: Minus },
}

export function ComplianceBadge({ status, short }: { status: ComplianceStatus; short?: boolean }) {
  const c = COMPLIANCE[status]
  return (
    <Pill tone={c.tone} icon={c.icon} className={status === "na" ? "bg-transparent text-muted-foreground/60" : undefined}>
      {short && status === "action_required" ? "Action" : c.label}
    </Pill>
  )
}

// Muted, distinguishable initials backgrounds (all pass white-text contrast)
const AVATAR_BG = ["#3b4754", "#1f5fa8", "#2c6e5a", "#5a4a9c", "#8a5a14", "#8e3b5c", "#2f6a78", "#6b4f3a"]

export function UserAvatar({ userId, size = "sm", className }: { userId?: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const u = useStore().userById(userId)
  const dims = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs" }[size]
  if (!u)
    return (
      <span
        title="Unassigned"
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/25", dims, className)}
      />
    )
  return (
    <span
      title={u.name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", dims, className)}
      style={{ background: AVATAR_BG[[...u.id].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_BG.length] }}
    >
      {u.initials}
    </span>
  )
}

export function Imo({ imo, className }: { imo: string; className?: string }) {
  return <span className={cn("font-mono text-[11px] tracking-tight text-muted-foreground", className)}>IMO {imo}</span>
}

export function FileIcon({ kind, className }: { kind: Attachment["kind"]; className?: string }) {
  const Icon = kind === "pdf" ? FileText : kind === "xlsx" || kind === "csv" ? FileSpreadsheet : File
  const color = kind === "pdf" ? "text-bad" : kind === "xlsx" || kind === "csv" ? "text-ok" : "text-info"
  return <Icon className={cn("size-4 shrink-0", color, className)} aria-hidden />
}

export function SlaPill({ state }: { state: { label: string; tone: "bad" | "warn" | "ok" } | null }) {
  if (!state) return null
  return (
    <Pill tone={state.tone === "ok" ? "neutral" : state.tone} icon={Clock}>
      {state.label}
    </Pill>
  )
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.85 ? "bg-ok" : value >= 0.6 ? "bg-[#fab219]" : "bg-bad"
  return (
    <span className="inline-flex items-center gap-1.5" title={`${pct}% confidence`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-[11px] text-muted-foreground">{pct}%</span>
    </span>
  )
}
