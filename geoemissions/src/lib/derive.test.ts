// Run: node --test src/lib/derive.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildAlerts, type AlertInput } from "./alerts.ts"
import { positions, responseWeekly, volumeWeekly } from "./metrics.ts"
import type { CarbonTxn, Message, RoleConfig, Thread, User } from "./types.ts"

const NOW = Date.parse("2026-10-14T06:30:00Z") // Wednesday, 12:00 IST
const m = (direction: Message["direction"], at: string): Message => ({ id: at, direction, from: { name: "", email: "" }, to: [], at, body: "" })
const thread = (p: Partial<Thread>): Thread =>
  ({ id: "t", subject: "S", orgId: "", vesselImos: [], labels: [{ category: "bdn", confidence: 1, source: "rule" }], status: "open", priority: "medium", messages: [], intel: { summary: "", extracted: [] }, notes: [], ...p }) as Thread

test("volume counts inbound messages per week by category group", () => {
  const rows = volumeWeekly([thread({ messages: [m("in", "2026-10-13T10:00:00Z"), m("out", "2026-10-13T11:00:00Z"), m("in", "2026-10-01T10:00:00Z")] })], 3, NOW)
  assert.deepEqual(rows.map((r) => [r.week, r.reports]), [["28 Sep", 1], ["5 Oct", 0], ["12 Oct", 1]])
})

test("response time is the median first-reply delay on customer threads", () => {
  const ts = [2, 4, 9].map((h, i) => thread({ id: String(i), customerId: "c1", messages: [m("in", "2026-10-12T00:00:00Z"), m("out", new Date(Date.parse("2026-10-12T00:00:00Z") + h * 3_600_000).toISOString())] }))
  const rows = responseWeekly([...ts, thread({ messages: [m("in", "2026-10-12T00:00:00Z"), m("out", "2026-10-12T01:00:00Z")] })], 2, NOW)
  assert.deepEqual(rows, [{ week: "5 Oct", hours: null }, { week: "12 Oct", hours: 4 }])
})

test("positions use booked transactions; proposed outflows are committed", () => {
  const x = (p: Partial<CarbonTxn>) => ({ id: "x", date: "2026-10-02", instrument: "EUA", qty: 100, currency: "EUR", counterparty: "", status: "settled", source: "platform", type: "buy", ...p }) as CarbonTxn
  const p = positions([x({}), x({ type: "transfer_out", qty: 30 }), x({ type: "surrender", qty: 20, status: "proposed" }), x({ instrument: "UKA", qty: 5 })], 2, NOW)
  assert.deepEqual(p.eua, { balance: 70, committed: 20 })
  assert.deepEqual(p.uka, { balance: 5, committed: 0 })
  assert.deepEqual(p.monthly, [{ month: "Sep", euaIn: 0, euaOut: 0 }, { month: "Oct", euaIn: 100, euaOut: 30 }])
})

const input = (p: Partial<AlertInput>): AlertInput => ({
  threads: [],
  invoices: [],
  compliance: [],
  allocations: [],
  deadlines: [],
  reports: [],
  txns: [],
  vessels: [],
  orgs: [],
  states: [],
  users: [],
  roles: [],
  policy: { hours: 24, reassign: false },
  sync: { syncedAt: "2026-10-14T06:00:00Z" },
  ...p,
})

test("record alerts go to the roles configured for that kind of mail, plus admins", () => {
  const roles: RoleConfig[] = [
    { id: "admin", label: "Admin", categories: [], capabilities: ["admin"] },
    { id: "billing", label: "Billing desk", categories: ["invoice"], capabilities: [] },
    { id: "seemp-desk", label: "SEEMP desk", categories: ["seemp"], capabilities: [] },
  ]
  const alerts = buildAlerts(
    input({
      roles,
      invoices: [{ id: "INV-1", kind: "service", customerId: "c1", description: "Q3", amount: 1, currency: "EUR", issued: "2026-09-01", due: "2026-10-01", status: "sent" }],
      compliance: [{ imo: "9385154", regulation: "seemp3", period: 2025, status: "overdue" }],
    }),
    NOW,
  )
  assert.deepEqual(alerts.map((a) => [a.type, a.roles.join()]), [["invoice_overdue", "billing,admin"], ["regulatory", "seemp-desk,admin"]])
})

test("an away assignee's mail alerts their backup; unanswered mail alerts whoever handles it; a failing sync alerts admins", () => {
  const roles: RoleConfig[] = [
    { id: "admin", label: "Admin", categories: [], capabilities: ["admin"] },
    { id: "analyst", label: "Analyst", categories: ["bdn"], capabilities: [] },
  ]
  const users: User[] = [
    { id: "a", name: "Asha", email: "a@x", role: "analyst", initials: "A", availability: "on_leave", awayUntil: "2026-10-20", backupId: "b" },
    { id: "b", name: "Ben", email: "b@x", role: "analyst", initials: "B" },
  ]
  const alerts = buildAlerts(
    input({
      roles,
      users,
      sync: { syncedAt: "2026-10-13T00:00:00Z", error: "Graph 401" },
      threads: [
        thread({ id: "x", assigneeId: "a", messages: [m("in", "2026-10-12T06:30:00Z")] }), // waiting 48h
        thread({ id: "y", messages: [m("in", "2026-10-13T00:00:00Z")] }), // unassigned, waiting 30h
        thread({ id: "z", slaDueAt: "2026-10-12T14:30:00Z", messages: [m("in", "2026-10-12T06:30:00Z")] }), // the SLA alert covers it
        thread({ id: "w", messages: [m("in", "2026-10-13T00:00:00Z"), m("out", "2026-10-13T01:00:00Z")] }), // answered
      ],
    }),
    NOW,
  )
  assert.deepEqual(
    alerts.map((a) => [a.id, a.severity, a.ownerId, a.roles.join()]),
    [
      ["cover:x", "medium", "b", "analyst,admin"],
      ["unanswered:x", "high", "b", "analyst,admin"],
      ["unanswered:y", "high", undefined, "analyst,admin"],
      ["sla:z", "critical", undefined, "analyst,admin"],
      ["sync:mail", "high", undefined, "admin"],
    ],
  )
})

test("alerts come from records, with stored snooze/resolve applied", () => {
  const alerts = buildAlerts(
    input({
      threads: [thread({ id: "a", slaDueAt: "2026-10-13T00:00:00Z" }), thread({ id: "b", slaDueAt: "2026-10-15T00:00:00Z" })],
      invoices: [{ id: "INV-1", kind: "service", customerId: "c1", description: "Q3", amount: 1, currency: "EUR", issued: "2026-09-01", due: "2026-10-01", status: "sent" }],
      deadlines: [{ id: "d1", date: "2026-10-20", title: "FuelEU plan", scope: "Fleet", href: "/compliance", severity: "high" }, { id: "d2", date: "2026-12-01", title: "Later", scope: "", href: "/", severity: "low" }],
      states: [{ id: "invoice_overdue:INV-1", status: "resolved" }, { id: "deadline:d1", status: "snoozed", snoozedUntil: "2026-10-14T04:00:00Z" }],
    }),
    NOW,
  )
  assert.deepEqual(
    alerts.map((a) => [a.id, a.severity, a.status]),
    [["sla:a", "critical", "open"], ["invoice_overdue:INV-1", "high", "resolved"], ["deadline:d1", "critical", "open"]], // snooze expired at 09:30
  )
})
