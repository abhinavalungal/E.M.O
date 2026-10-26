"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { AlarmClock, BellOff, Check, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import type { Alert } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "./page"
import { Pill, UserAvatar } from "./pills"
import { AlertRow } from "./home"

const TYPE_LABEL: Record<Alert["type"], string> = {
  sla: "SLA",
  missing_bdn: "Missing BDN",
  missing_report: "Missing report",
  deadline: "Deadline",
  invoice_overdue: "Invoice overdue",
  allocation_missing: "Allocation",
  needs_review: "Needs review",
  duplicate: "Duplicate",
  assigned: "Assigned",
  regulatory: "Regulatory",
  transaction: "Transaction",
  cover: "Backup cover",
  unanswered: "Unanswered",
  sync: "Mail sync",
}
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export function AlertsPage() {
  const { alerts, updateAlert, alertForMe, me } = useStore()
  const [status, setStatus] = useState<Alert["status"]>("open")
  const [scope, setScope] = useState<"role" | "mine" | "all">("role")

  const list = alerts
    .filter((a) => a.status === status)
    .filter((a) => (scope === "all" ? true : scope === "mine" ? a.ownerId === me.id : alertForMe(a)))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.at.localeCompare(a.at))

  const counts = { open: 0, snoozed: 0, resolved: 0 }
  for (const a of alerts) counts[a.status]++

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Exceptions detected by automation rules — SLA timers, missing reports, deadlines, overdue invoices, low-confidence AI. Each links to the record to act on."
      >
        <div className="flex flex-wrap items-center gap-4 pb-3">
          <div className="inline-flex rounded-lg border bg-background p-0.5">
            {(["open", "snoozed", "resolved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize", status === s ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground")}
              >
                {s} <span className="opacity-70">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border bg-background p-0.5">
            {(
              [
                ["role", "For my role"],
                ["mine", "Assigned to me"],
                ["all", "Everything"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={cn("rounded-md px-3 py-1 text-xs font-medium", scope === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="px-4 py-5 md:px-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          {list.length === 0 ? (
            <EmptyState icon={BellOff} title={`No ${status} alerts`} hint="Alerts appear when an automation rule detects something that needs a person." />
          ) : (
            <ul className="divide-y">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 pr-4 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <AlertRow a={a} />
                  </div>
                  <Pill className="hidden md:inline-flex">{TYPE_LABEL[a.type]}</Pill>
                  <UserAvatar userId={a.ownerId} size="xs" className="hidden md:inline-flex" />
                  <span className="flex shrink-0 items-center gap-1 pb-3 pl-11 sm:p-0">
                    <Button size="xs" variant="outline" asChild>
                      <Link href={a.href}>
                        <ExternalLink /> Open
                      </Link>
                    </Button>
                    {a.status === "open" && (
                      <>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            updateAlert(a.id, { status: "snoozed" })
                            toast("Snoozed until tomorrow 09:30", { description: a.title })
                          }}
                        >
                          <AlarmClock /> Snooze
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            updateAlert(a.id, { status: "resolved" })
                            toast.success("Alert resolved", { description: a.title })
                          }}
                        >
                          <Check /> Resolve
                        </Button>
                      </>
                    )}
                    {a.status !== "open" && (
                      <Button size="xs" variant="ghost" onClick={() => updateAlert(a.id, { status: "open" })}>
                        Reopen
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Alerts are computed from live mail and database records on every refresh. Delivery is in-app only; Teams and email digests are not connected yet.
        </p>
      </div>
    </>
  )
}
