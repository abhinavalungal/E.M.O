"use client"

import Link from "next/link"
import { Paperclip, Ship, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import { fmtListTime, slaState } from "@/lib/format"
import type { Thread } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { CategoryChip, PriorityIcon, SlaPill, STATUS, UserAvatar } from "../pills"

export function ThreadRow({ t, active, href, picked, onPick }: { t: Thread; active: boolean; href: string; picked?: boolean; onPick?: (on: boolean) => void }) {
  const last = t.messages[t.messages.length - 1]
  const first = t.messages[0]
  const sender = first.direction === "out" ? `To: ${first.to[0]}` : first.from.name
  const { orgById, vesselByImo } = useStore()
  const org = orgById(t.orgId)
  const vessel = vesselByImo(t.vesselImos[0])
  const hasAtt = t.messages.some((m) => m.attachments?.length)
  const status = STATUS[t.status]
  const sla = t.status !== "resolved" ? slaState(t.slaDueAt) : null

  return (
    <div className="relative">
      {onPick && (
        // Outside the link: a control inside <a> would navigate on click.
        <Checkbox checked={picked} onCheckedChange={(c) => onPick(!!c)} className="absolute top-3.5 left-3 z-10 bg-card" aria-label={`Select ${t.subject}`} />
      )}
      <Link
        href={href}
        scroll={false}
        data-thread={t.id}
        className={cn(
          "relative block border-b px-4 py-3 transition-colors outline-none",
          onPick && "pl-9",
          active || picked ? "bg-sky-soft" : "hover:bg-muted/60 focus-visible:bg-muted/60",
        )}
      >
        {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-sky" aria-hidden />}
        <div className="flex items-center gap-2">
          {t.unread && <span className="size-1.5 shrink-0 rounded-full bg-sky" aria-label="Unread" />}
          <span className={cn("min-w-0 truncate text-[13px]", t.unread ? "font-semibold text-foreground" : "font-medium text-foreground/85")}>
            {sender}
          </span>
          {org && org.kind !== "internal" && <span className="hidden truncate text-[12px] text-muted-foreground sm:inline">· {org.short}</span>}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular">{fmtListTime(last.at)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {t.important && <Star className="size-3.5 shrink-0 fill-[#fab219] text-[#fab219]" aria-label="Important" />}
          <span className={cn("truncate text-[13px]", t.unread ? "font-semibold text-foreground" : "text-foreground/85")}>{t.subject}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{t.intel.summary}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span title={status.label} className="flex shrink-0 items-center">
              <status.icon
                className={cn(
                  "size-3.5",
                  { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", neutral: "text-muted-foreground", brand: "text-brand" }[status.tone],
                )}
              />
            </span>
            <CategoryChip category={t.labels[0].category} />
            {vessel && (
              <span className="inline-flex h-5 min-w-0 items-center gap-1 truncate rounded-md bg-muted px-1.5 text-[11px] text-foreground/75">
                <Ship className="size-3 shrink-0" />
                <span className="truncate">{vessel.name.replace(/^(MV|MT)\s+/, "")}</span>
                {t.vesselImos.length > 1 && <span className="text-muted-foreground">+{t.vesselImos.length - 1}</span>}
              </span>
            )}
            {t.needsReview && <span className="rounded-md bg-warn-soft px-1.5 text-[11px] leading-5 font-medium text-warn">Review</span>}
            <SlaPill state={sla} />
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            {hasAtt && <Paperclip className="size-3.5" aria-label="Has attachments" />}
            <PriorityIcon priority={t.priority} />
            <UserAvatar userId={t.assigneeId} size="xs" />
          </span>
        </div>
      </Link>
    </div>
  )
}
