// Alerts are derived from live records on every render; only snooze/resolve is stored (alert_state).
// Ids are "<type>:<record id>" so a stored state keeps pointing at the same exception.
import { CATEGORIES, REGULATIONS, SYNC_EVERY_MS } from "./data.ts"
import { daysUntil, fmtDate } from "./format.ts"
import { can, coverFor, isAway, unansweredHours } from "./team.ts"
import type { Alert, Allocation, CarbonTxn, Category, ComplianceItem, Deadline, EscalationPolicy, Invoice, Org, Report, Role, RoleConfig, Thread, User, Vessel } from "./types"

export type AlertState = { id: string; status: Alert["status"]; snoozedUntil?: string }

export type AlertInput = {
  threads: Thread[]
  invoices: Invoice[]
  compliance: ComplianceItem[]
  allocations: Allocation[]
  deadlines: Deadline[]
  reports: Report[]
  txns: CarbonTxn[]
  vessels: Vessel[]
  orgs: Org[]
  states: AlertState[]
  users: User[]
  roles: RoleConfig[]
  policy: EscalationPolicy
  sync: { syncedAt?: string; error?: string }
}

/** Mail sync has failed or not run for over an hour (the app syncs hourly). */
export const syncStale = (sync: { syncedAt?: string; error?: string }, now = Date.now()) =>
  !!sync.error || !sync.syncedAt || now - Date.parse(sync.syncedAt) > SYNC_EVERY_MS + 15 * 60_000

const HOUR = 3_600_000
const ist = (date: string) => new Date(date + "T04:00:00Z").toISOString() // 09:30 IST

export function buildAlerts(d: AlertInput, now = Date.now()): Alert[] {
  const out: Omit<Alert, "status">[] = []
  const org = (id?: string) => d.orgs.find((o) => o.id === id)
  const vessel = (imo: string) => d.vessels.find((v) => v.imo === imo)
  const thread = (id: string) => `/inbox?view=all&t=${encodeURIComponent(id)}`
  const ids = (f: (r: RoleConfig) => boolean) => d.roles.filter(f).map((r) => r.id)
  const admins = ids((r) => can(r, "admin"))
  const ALL: Role[] = d.roles.map((r) => r.id)
  const rolesFor = (c: Category): Role[] => [...new Set([...ids((r) => r.categories.includes(c)), ...admins])]
  const user = (id?: string) => d.users.find((u) => u.id === id)

  for (const t of d.threads.filter((t) => t.status !== "resolved")) {
    const roles = rolesFor(t.labels[0].category)
    const owner = coverFor(t.assigneeId, d.users, now)?.id // the backup while the assignee is away
    if (t.slaDueAt) {
      const h = (Date.parse(t.slaDueAt) - now) / HOUR
      if (h < 2)
        out.push({
          id: `sla:${t.id}`,
          type: "sla",
          severity: h < -24 ? "critical" : h < 0 ? "high" : "medium",
          title: h < 0 ? `SLA breached — ${t.subject}` : `SLA due in ${Math.max(1, Math.round(h * 60))}m — ${t.subject}`,
          detail: `${org(t.customerId)?.name ?? "Customer"} is waiting for a reply${h < 0 ? ` · ${Math.round(-h)}h past target` : ""}.`,
          at: t.slaDueAt,
          href: thread(t.id),
          ownerId: owner,
          roles,
        })
    }
    if (t.needsReview)
      out.push({
        id: `needs_review:${t.id}`,
        type: "needs_review",
        severity: "medium",
        title: `Classification needs review — ${t.subject}`,
        detail: `Best guess ${CATEGORIES[t.labels[0].category].label}.`,
        at: t.messages[t.messages.length - 1].at,
        href: thread(t.id),
        ownerId: owner,
        roles,
      })
    const a = user(t.assigneeId)
    if (a && (a.active === false || isAway(a, now)))
      out.push({
        id: `cover:${t.id}`,
        type: "cover",
        severity: "medium",
        title: `${owner ? `Covering for ${a.name}` : `${a.name} is away, no backup available`} — ${t.subject}`,
        detail: a.active === false ? `${a.name} was removed from the team.` : `${a.name} is ${a.availability === "on_leave" ? "on leave" : "unavailable"}${a.awayUntil ? ` until ${fmtDate(a.awayUntil)}` : ""}.`,
        at: new Date(now).toISOString(),
        href: thread(t.id),
        ownerId: owner,
        roles,
      })
    const h = unansweredHours(t, now)
    if (h !== undefined && h >= d.policy.hours && !t.slaDueAt) // customer mail already has the SLA alert
      out.push({
        id: `unanswered:${t.id}`,
        type: "unanswered",
        severity: "high",
        title: `${t.assigneeId ? "Unanswered" : "Unassigned and unanswered"} for ${Math.round(h)}h — ${t.subject}`,
        detail: owner ? `Waiting on ${user(owner)?.name}.` : t.assigneeId ? "The assignee and their backup are away." : "Nobody has picked this up.",
        at: new Date(now - (h - d.policy.hours) * HOUR).toISOString(),
        href: thread(t.id),
        ownerId: owner,
        roles,
      })
  }

  for (const i of d.invoices) {
    const days = daysUntil(i.due, now)
    if (i.status === "paid" || i.status === "draft" || (days >= 0 && i.status !== "overdue")) continue
    out.push({
      id: `invoice_overdue:${i.id}`,
      type: "invoice_overdue",
      severity: days < -30 ? "critical" : "high",
      title: `Invoice ${i.id} overdue — ${org(i.customerId)?.short ?? i.customerId}`,
      detail: `${i.description} · due ${i.due}${days < 0 ? ` (${-days}d ago)` : ""}.`,
      at: ist(i.due),
      href: `/commercial?tab=invoices&q=${i.id}`,
      ownerId: org(i.customerId)?.ownerId,
      roles: rolesFor("invoice"),
    })
  }

  for (const c of d.compliance.filter((c) => c.status === "action_required" || c.status === "overdue"))
    out.push({
      id: `regulatory:${c.imo}:${c.regulation}:${c.period}`,
      type: "regulatory",
      severity: c.status === "overdue" ? "critical" : "high",
      title: `${REGULATIONS[c.regulation].label} ${c.period} ${c.status === "overdue" ? "overdue" : "needs action"} — ${vessel(c.imo)?.name ?? `IMO ${c.imo}`}`,
      detail: [c.note, c.due && `Due ${c.due}`].filter(Boolean).join(" · ") || "See the compliance record.",
      at: c.due ? ist(c.due) : new Date(now).toISOString(),
      href: `/vessels/${c.imo}?tab=compliance`,
      roles: rolesFor(c.regulation.startsWith("seemp") ? "seemp" : (c.regulation as Category)),
    })

  for (const x of d.deadlines) {
    const days = daysUntil(x.date, now)
    if (days < 0 || days > 14) continue
    out.push({
      id: `deadline:${x.id}`,
      type: "deadline",
      severity: days <= 7 ? "critical" : x.severity,
      title: `${x.title} — ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
      detail: x.scope,
      at: ist(x.date),
      href: x.href,
      roles: ALL,
    })
  }

  for (const a of d.allocations.filter((a) => a.status === "pending_confirmation")) {
    const days = Math.floor((now - Date.parse(a.requestedAt)) / (24 * HOUR))
    if (days < 7) continue
    out.push({
      id: `allocation_missing:${a.id}`,
      type: "allocation_missing",
      severity: "medium",
      title: `Allocation ${a.id} awaiting confirmation for ${days} days`,
      detail: `${org(a.customerId)?.short ?? a.customerId} · ${a.qty.toLocaleString()} ${a.instrument} · ${a.period}`,
      at: a.requestedAt,
      href: "/commercial?tab=allocations",
      ownerId: org(a.customerId)?.ownerId,
      roles: rolesFor("allocation"),
    })
  }

  for (const r of d.reports.filter((r) => r.status === "missing"))
    out.push({
      id: `missing:${r.id}`,
      type: r.type === "BDN" ? "missing_bdn" : "missing_report",
      severity: "high",
      title: `Missing ${r.type} — ${vessel(r.imo)?.name ?? `IMO ${r.imo}`}`,
      detail: r.label,
      at: r.at,
      href: `/vessels/${r.imo}?tab=reports`,
      roles: rolesFor(r.type === "BDN" ? "bdn" : "vessel_report"),
    })

  for (const v of d.vessels.filter((v) => v.lastReportAt && now - Date.parse(v.lastReportAt) > 48 * HOUR))
    out.push({
      id: `silent:${v.imo}`,
      type: "missing_report",
      severity: "medium",
      title: `No report from ${v.name} for ${Math.round((now - Date.parse(v.lastReportAt!)) / HOUR)}h`,
      detail: "Noon reports are expected daily; alert after 48h of silence.",
      at: new Date(Date.parse(v.lastReportAt!) + 48 * HOUR).toISOString(),
      href: `/vessels/${v.imo}`,
      ownerId: org(v.customerId)?.ownerId,
      roles: rolesFor("vessel_report"),
    })

  for (const x of d.txns.filter((x) => x.status === "proposed"))
    out.push({
      id: `transaction:${x.id}`,
      type: "transaction",
      severity: "low",
      title: `Trade to confirm — ${x.type.replace("_", " ")} ${x.qty.toLocaleString()} ${x.instrument}`,
      detail: x.counterparty,
      at: ist(x.date),
      href: "/commercial?tab=carbon",
      roles: rolesFor("carbon_trading"),
    })

  if (syncStale(d.sync, now))
    out.push({
      id: "sync:mail",
      type: "sync",
      severity: d.sync.error ? "high" : "medium",
      title: d.sync.error ? "Mailbox sync is failing" : d.sync.syncedAt ? "Mailbox sync is overdue" : "Mailbox has never synced",
      detail: d.sync.error ?? "New mail is not coming in. Use Sync now in the header, or check the pipeline.",
      at: d.sync.syncedAt ?? new Date(now).toISOString(),
      href: "/admin?tab=integrations",
      roles: admins,
    })

  const states = new Map(d.states.map((s) => [s.id, s]))
  return out.map((a) => {
    const s = states.get(a.id)
    const woke = s?.status === "snoozed" && !!s.snoozedUntil && Date.parse(s.snoozedUntil) <= now
    return { ...a, status: !s || woke ? "open" : s.status }
  })
}
