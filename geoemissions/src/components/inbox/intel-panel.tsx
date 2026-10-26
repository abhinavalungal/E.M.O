"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, Sparkles, X } from "lucide-react"
import { CATEGORIES } from "@/lib/data"
import { daysUntil, fmtAgo, fmtDate } from "@/lib/format"
import { inboxHref } from "@/lib/query"
import { useStore } from "@/lib/store"
import type { Category, Thread } from "@/lib/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { CategoryChip, Confidence, FileIcon, Imo, StatusPill } from "../pills"

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const SOURCE_LABEL = { rule: "Rule", ai: "AI", human: "Human" }

export function IntelPanel({ thread: t }: { thread: Thread }) {
  const { threads, updateThread, orgById, userById, vesselByImo, activity } = useStore()
  const history = activity.filter((a) => a.href?.endsWith(`t=${encodeURIComponent(t.id)}`)).slice(0, 12) // newest first
  const [proposal, setProposal] = useState<"open" | "applied" | "dismissed">("open")
  const vessels = t.vesselImos.map(vesselByImo).filter((v) => !!v)
  const org = orgById(t.customerId ?? t.orgId)
  const owner = userById(org?.ownerId)
  const attachments = t.messages.flatMap((m) => m.attachments ?? [])
  const related = threads
    .filter((x) => x.id !== t.id && (x.vesselImos.some((i) => t.vesselImos.includes(i)) || (t.customerId && x.customerId === t.customerId)))
    .sort((a, b) => Number(b.vesselImos.some((i) => t.vesselImos.includes(i))) - Number(a.vesselImos.some((i) => t.vesselImos.includes(i))))
    .slice(0, 5)
  const days = t.intel.deadline ? daysUntil(t.intel.deadline) : null

  const relabel = (c: Category) => {
    updateThread(t.id, { labels: [{ category: c, confidence: 1, source: "human" }, ...t.labels.filter((l) => l.category !== c)], needsReview: false })
    toast.success(`Classified as ${CATEGORIES[c].label}`, { description: "Saved for this conversation." })
  }

  return (
    <div className="text-[13px]">
      {t.intel.action && (
        <Section title="Intelligence" action={<Sparkles className="size-3.5 text-sky" />}>
          <dl className="space-y-2.5">
            <div>
              <dt className="text-xs text-muted-foreground">Request</dt>
              <dd className="mt-0.5 text-foreground">{t.intel.request}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Required action</dt>
              <dd className="mt-0.5 font-medium text-foreground">{t.intel.action}</dd>
            </div>
            {t.intel.deadline && days !== null && (
              <div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
                <CalendarClock className="size-4 text-muted-foreground" />
                <span>
                  Due <span className="font-medium">{fmtDate(t.intel.deadline + "T06:30:00Z")}</span>
                </span>
                <span className={days <= 1 ? "ml-auto text-xs font-medium text-bad" : days <= 7 ? "ml-auto text-xs font-medium text-warn" : "ml-auto text-xs text-muted-foreground"}>
                  {days < 0 ? `${-days}d overdue` : days === 0 ? "today" : `in ${days}d`}
                </span>
              </div>
            )}
            {t.intel.missing && (
              <div className="rounded-md border border-warn/20 bg-warn-soft px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-warn">
                  <AlertTriangle className="size-3.5" /> Missing information
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
                  {t.intel.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </dl>
        </Section>
      )}

      {t.intel.proposal && proposal !== "dismissed" && (
        <Section title="Suggested update">
          {proposal === "applied" ? (
            <p className="flex items-center gap-1.5 text-xs text-ok">
              <Check className="size-3.5" /> Applied · recorded in the audit log
            </p>
          ) : (
            <div className="rounded-lg border border-sky/25 bg-sky-soft/60 p-3">
              <p className="text-foreground">{t.intel.proposal.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">AI proposal from this email — nothing changes until you apply it.</p>
              <div className="mt-2.5 flex gap-2">
                <Button
                  size="xs"
                  onClick={() => {
                    setProposal("applied")
                    toast.success("Update applied", { description: t.intel.proposal!.text })
                  }}
                >
                  <Check /> Apply
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setProposal("dismissed")}>
                  <X /> Dismiss
                </Button>
              </div>
            </div>
          )}
        </Section>
      )}

      {vessels.length > 0 && (
        <Section title={vessels.length > 1 ? `Vessels (${vessels.length})` : "Vessel"}>
          <div className="space-y-2">
            {vessels.map((v) => (
              <Link key={v.imo} href={`/vessels/${v.imo}`} className="group block rounded-md border p-2.5 transition-colors hover:border-foreground/25">
                <div className="flex items-center gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{v.name}</span>
                    <Imo imo={v.imo} />
                  </span>
                  <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Voyage</span>
                  <span className="truncate text-right font-mono text-[11px]">{t.voyage ?? v.voyage?.no ?? "—"}</span>
                  <span className="text-muted-foreground">Route</span>
                  <span className="truncate text-right">
                    {v.voyage?.from ?? "—"} → {v.voyage?.to ?? "—"}
                  </span>
                  <span className="text-muted-foreground">Type</span>
                  <span className="truncate text-right">{v.type}</span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {org && (
        <Section title={org.kind === "customer" ? "Customer" : "Sender organisation"}>
          <Link href={org.kind === "customer" ? `/customers/${org.id}` : "#"} className="block">
            <span className="font-medium text-foreground hover:underline">{org.name}</span>
            <span className="block text-xs text-muted-foreground">
              {org.domain} · {org.country}
              {owner && ` · Account owner ${owner.name}`}
            </span>
          </Link>
        </Section>
      )}

      {t.intel.extracted.length > 0 && (
        <Section title="Extracted data">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {t.intel.extracted.map((e) => (
              <div key={e.label} className="contents">
                <dt className="text-muted-foreground">{e.label}</dt>
                <dd className="text-right font-medium text-foreground">{e.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section
        title="Classification"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger className="text-xs font-medium text-sky hover:underline">Change</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Set primary category</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                <DropdownMenuItem key={c} onSelect={() => relabel(c)}>
                  {CATEGORIES[c].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <ul className="space-y-1.5">
          {t.labels.map((l) => (
            <li key={l.category} className="flex items-center gap-2">
              <CategoryChip category={l.category} />
              <span className="text-[11px] text-muted-foreground">{SOURCE_LABEL[l.source]}</span>
              <span className="ml-auto">
                <Confidence value={l.confidence} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {attachments.length > 0 && (
        <Section title={`Attachments (${attachments.length})`}>
          <ul className="space-y-1.5">
            {attachments.map((a, i) => (
              <li key={a.name + i} className="flex items-center gap-2 text-xs">
                <FileIcon kind={a.kind} />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.duplicateOf ? <span className="text-warn">Duplicate</span> : a.scanned ? <span className="text-muted-foreground">OCR</span> : null}
                <span className="text-muted-foreground">{a.size}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(history.length > 0 || t.originalAssigneeId) && (
        <Section title="History">
          {t.originalAssigneeId && (
            <p className="mb-2 text-xs text-muted-foreground">
              Original PIC: <span className="text-foreground">{userById(t.originalAssigneeId)?.name}</span>
            </p>
          )}
          <ol className="space-y-1.5">
            {history.map((a) => (
              <li key={a.id} className="text-xs leading-snug">
                <span className="font-medium text-foreground">{a.actorId === "system" ? "Automation" : (userById(a.actorId)?.name ?? a.actorId)}</span>{" "}
                <span className="text-muted-foreground">{a.action.replace(/ (to|on|:)$/, "")}</span>
                <span className="block text-[11px] text-muted-foreground/80">{fmtAgo(a.at)}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {related.length > 0 && (
        <Section title="Related emails">
          <ul className="space-y-1">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={inboxHref({ view: "all", t: r.id })} scroll={false} className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/60">
                  <span className="line-clamp-1 text-xs text-foreground">{r.subject}</span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <CategoryChip category={r.labels[0].category} />
                    <StatusPill status={r.status} />
                    <span className="ml-auto text-[11px] text-muted-foreground">{fmtAgo(r.messages[r.messages.length - 1].at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
