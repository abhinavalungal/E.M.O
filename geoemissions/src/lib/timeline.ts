// Builds the chronological activity feed for a vessel or customer from every linked record.
import { REGULATIONS } from "./data"
import type { Allocation, CarbonTxn, ComplianceItem, Invoice, Report, Thread, Vessel } from "./types"

export type TimelineEvent = {
  at: string
  kind: "email_in" | "email_out" | "report" | "missing" | "compliance" | "commercial"
  title: string
  detail?: string
  href?: string
}

const iso = (date: string) => new Date(date + "T04:00:00Z").toISOString() // 09:30 IST, start of business

export function buildTimeline(opts: {
  imos: string[]
  customerId?: string
  threads: Thread[]
  txns: CarbonTxn[]
  reports: Report[]
  compliance: ComplianceItem[]
  allocations: Allocation[]
  invoices: Invoice[]
  vessels: Vessel[]
}): TimelineEvent[] {
  const { imos, customerId, threads, txns, reports, compliance, allocations, invoices, vessels } = opts
  const linked = (imo?: string, cust?: string) => (imo && imos.includes(imo)) || (!!customerId && cust === customerId)
  const ev: TimelineEvent[] = []

  for (const t of threads.filter((t) => t.vesselImos.some((i) => imos.includes(i)) || (customerId && t.customerId === customerId))) {
    for (const m of t.messages)
      ev.push({
        at: m.at,
        kind: m.direction === "in" ? "email_in" : "email_out",
        title: m.direction === "in" ? `Email received · ${t.subject}` : `Reply sent · ${t.subject}`,
        detail: m.direction === "in" ? m.from.name : undefined,
        href: `/inbox?view=all&t=${t.id}`,
      })
  }
  for (const r of reports.filter((r) => imos.includes(r.imo)))
    ev.push({
      at: r.at,
      kind: r.status === "missing" ? "missing" : "report",
      title: r.status === "missing" ? `${r.type} missing · ${r.label}` : `${r.type} ${r.status === "received" ? "received" : r.status} · ${r.label}`,
      detail: vessels.find((v) => v.imo === r.imo)?.name,
      href: r.threadId ? `/inbox?view=all&t=${r.threadId}` : undefined,
    })
  for (const c of compliance.filter((c) => imos.includes(c.imo) && c.note && c.status !== "complete" && c.status !== "in_progress")) {
    const at = threads.find((x) => x.id === c.threadId)?.messages[0].at ?? (c.due && iso(c.due))
    if (!at) continue // no date to place it on
    ev.push({
      at,
      kind: "compliance",
      title: `${REGULATIONS[c.regulation].label} ${c.period} → ${c.status.replace("_", " ")}`,
      detail: c.note,
      href: c.threadId ? `/inbox?view=all&t=${c.threadId}` : undefined,
    })
  }
  for (const x of txns.filter((x) => linked(x.imo, x.customerId)))
    ev.push({
      at: iso(x.date),
      kind: "commercial",
      title: `${x.type.replace("_", " ")} ${x.qty.toLocaleString()} ${x.instrument} · ${x.status}`,
      detail: x.counterparty,
      href: "/commercial?tab=carbon",
    })
  for (const a of allocations.filter((a) => linked(a.imo, a.customerId)))
    ev.push({ at: a.requestedAt, kind: "commercial", title: `Allocation ${a.id} requested · ${a.qty.toLocaleString()} ${a.instrument}`, detail: a.period, href: "/commercial?tab=allocations" })
  for (const i of invoices.filter((i) => linked(i.imo, i.customerId)))
    ev.push({ at: iso(i.issued), kind: "commercial", title: `Invoice ${i.id} issued · ${i.status}`, detail: i.description, href: "/commercial?tab=invoices" })

  return ev.sort((a, b) => b.at.localeCompare(a.at))
}
