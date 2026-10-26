// Run: node --test src/lib/team.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { canSee, cleanRole, cleanUser, coverFor, isAway, planEscalations, viewer } from "./team.ts"
import type { Message, RoleConfig, Thread, User } from "./types.ts"

const NOW = Date.parse("2026-10-22T06:30:00Z") // Thursday, 12:00 IST
const H = 3_600_000
const user = (p: Partial<User>): User => ({ id: "u", name: "U", email: "u@geoserves.com", role: "analyst", initials: "U", ...p })
const msg = (direction: Message["direction"], hoursAgo: number): Message => ({
  id: String(hoursAgo),
  direction,
  from: { name: "", email: "" },
  to: [],
  at: new Date(NOW - hoursAgo * H).toISOString(),
  body: "",
})
const thread = (p: Partial<Thread>): Thread =>
  ({ id: "t", subject: "S", orgId: "", vesselImos: [], labels: [{ category: "bdn", confidence: 1, source: "rule" }], status: "open", priority: "medium", messages: [msg("in", 1)], intel: { summary: "", extracted: [] }, notes: [], ...p }) as Thread

test("a user is away while on leave or unavailable, between the dates (inclusive, IST days)", () => {
  assert.equal(isAway(user({}), NOW), false)
  assert.equal(isAway(user({ availability: "unavailable" }), NOW), true)
  assert.equal(isAway(user({ availability: "on_leave", awayFrom: "2026-10-20", awayUntil: "2026-10-22" }), NOW), true)
  assert.equal(isAway(user({ availability: "on_leave", awayFrom: "2026-10-23" }), NOW), false) // not started
  assert.equal(isAway(user({ availability: "on_leave", awayUntil: "2026-10-21" }), NOW), false) // back today
  assert.equal(isAway(user({ availability: "on_leave", awayUntil: "2026-10-21" }), Date.parse("2026-10-21T18:00:00Z")), true) // 23:30 IST on the 21st
})

test("an away assignee is covered by their backup, unless the backup is away or removed", () => {
  const a = user({ id: "a", availability: "on_leave", backupId: "b" })
  const b = user({ id: "b" })
  assert.equal(coverFor("a", [a, b], NOW)?.id, "b")
  assert.equal(coverFor("b", [a, b], NOW)?.id, "b")
  assert.equal(coverFor("a", [a, { ...b, availability: "unavailable" }], NOW), undefined)
  assert.equal(coverFor("a", [a, { ...b, active: false }], NOW), undefined)
  assert.equal(coverFor(undefined, [a, b], NOW), undefined)
})

test("users see their role's categories and mail assigned to them or to whoever they back up; mail.all sees everything", () => {
  const analyst: RoleConfig = { id: "analyst", label: "Analyst", categories: ["bdn"], capabilities: [] }
  const me = user({ id: "me" })
  const users = [me, user({ id: "p", backupId: "me" }), user({ id: "q" })]
  const invoice = thread({ labels: [{ category: "invoice", confidence: 1, source: "rule" }] })
  assert.equal(canSee(thread({}), me, analyst, users), true)
  assert.equal(canSee(invoice, me, analyst, users), false)
  assert.equal(canSee({ ...invoice, assigneeId: "me" }, me, analyst, users), true)
  assert.equal(canSee({ ...invoice, assigneeId: "p" }, me, analyst, users), true)
  assert.equal(canSee({ ...invoice, assigneeId: "q" }, me, analyst, users), false)
  assert.equal(canSee(invoice, me, { ...analyst, capabilities: ["mail.all"] }, users), true)
  assert.equal(canSee(thread({}), me, undefined, users), false) // a role missing from the roles table sees only its own mail
})

test("open mail of an away assignee moves to their backup when the policy reassigns", () => {
  const users = [user({ id: "a", name: "Asha", availability: "on_leave", backupId: "b" }), user({ id: "b", name: "Ben" })]
  const ts = [
    thread({ id: "1", assigneeId: "a" }),
    thread({ id: "2", assigneeId: "a", status: "resolved" }),
    thread({ id: "3", assigneeId: "a", escalatedAt: "2026-10-21T00:00:00Z" }), // already moved once
    thread({ id: "4", assigneeId: "a", messages: [msg("in", 3), msg("out", 2)] }), // answered, waiting on the customer
  ]
  assert.deepEqual(planEscalations(ts, users, { hours: 24, reassign: true }, NOW), [{ threadId: "1", subject: "S", from: "a", to: "b", original: "a", reason: "Asha is away" }])
  assert.deepEqual(planEscalations(ts, users, { hours: 24, reassign: false }, NOW), [])
})

test("mail unanswered past the policy hours moves once to the assignee's backup, counted from the first unanswered message", () => {
  const users = [user({ id: "a", name: "Asha", backupId: "b" }), user({ id: "b" }), user({ id: "c" })]
  const ts = [
    thread({ id: "1", assigneeId: "a", messages: [msg("out", 40), msg("in", 30), msg("in", 2)], originalAssigneeId: "c" }),
    thread({ id: "2", assigneeId: "a", messages: [msg("in", 30), msg("out", 20), msg("in", 2)] }),
    thread({ id: "3", assigneeId: "c", messages: [msg("in", 30)] }), // no backup: alerts escalate instead
    thread({ id: "4", messages: [msg("in", 30)] }), // unassigned
  ]
  assert.deepEqual(planEscalations(ts, users, { hours: 24, reassign: true }, NOW), [{ threadId: "1", subject: "S", from: "a", to: "b", original: "c", reason: "unanswered for 30h" }])
})

test("the signed-in user is the picked one while active, else the lead admin, else the first active user", () => {
  const roles: RoleConfig[] = [{ id: "admin", label: "Admin", categories: [], capabilities: ["admin"] }]
  const users = [user({ id: "gone", active: false }), user({ id: "a" }), user({ id: "lead", role: "admin", lead: true })]
  assert.equal(viewer(users, roles, "a")?.id, "a")
  assert.equal(viewer(users, roles, "gone")?.id, "lead")
  assert.equal(viewer(users, roles, undefined)?.id, "lead")
  assert.equal(viewer(users.slice(0, 2), roles, "zz")?.id, "a")
})

test("role edits keep only known categories and capabilities; admins can't drop their own admin capability", () => {
  const me = user({ id: "me", role: "admin" })
  assert.deepEqual(cleanRole({ label: " Ops Desk ", categories: ["bdn", "nope"], capabilities: ["mail.all", "root"] }, me), { id: "ops-desk", label: "Ops Desk", categories: ["bdn"], capabilities: ["mail.all"] })
  assert.deepEqual(cleanRole({ id: "analyst", label: "Analyst", categories: [], capabilities: [] }, me).id, "analyst")
  assert.throws(() => cleanRole({ label: " ", categories: [], capabilities: [] }, me), /Name/)
  assert.throws(() => cleanRole({ id: "admin", label: "Admin", categories: [], capabilities: ["mail.all"] }, me), /your own admin/)
})

test("user input is validated against the roles and team before it is saved", () => {
  const roles: RoleConfig[] = [{ id: "admin", label: "Admin", categories: [], capabilities: ["admin"] }, { id: "analyst", label: "Analyst", categories: [], capabilities: [] }]
  const me = user({ id: "me", role: "admin" })
  const ctx = { roles, users: [me, user({ id: "b" })], me }
  assert.deepEqual(cleanUser({ name: " Priya Nair ", email: "Priya@GeoServes.com", role: "analyst" }, ctx), {
    name: "Priya Nair",
    email: "priya@geoserves.com",
    role: "analyst",
    initials: "PN",
    lead: false,
    active: true,
    backupId: null,
    availability: "available",
    awayFrom: null,
    awayUntil: null,
  })
  assert.throws(() => cleanUser({ name: "", email: "a@b.co", role: "analyst" }, ctx), /Name/)
  assert.throws(() => cleanUser({ name: "A", email: "not-an-email", role: "analyst" }, ctx), /email/)
  assert.throws(() => cleanUser({ name: "A", email: "a@b.co", role: "boss" }, ctx), /role/)
  assert.throws(() => cleanUser({ id: "b", name: "A", email: "a@b.co", role: "analyst", backupId: "b" }, ctx), /backup/)
  assert.throws(() => cleanUser({ name: "A", email: "a@b.co", role: "analyst", backupId: "zz" }, ctx), /backup/)
  assert.throws(() => cleanUser({ name: "A", email: "a@b.co", role: "analyst", availability: "on_leave", awayFrom: "2026-10-25", awayUntil: "2026-10-20" }, ctx), /date/)
  assert.throws(() => cleanUser({ id: "me", name: "A", email: "a@b.co", role: "analyst" }, ctx), /your own admin/)
  assert.throws(() => cleanUser({ id: "me", name: "A", email: "a@b.co", role: "admin", active: false }, ctx), /your own admin/)
  const analyst = user({ id: "an", role: "analyst" })
  assert.equal(cleanUser({ ...analyst, availability: "on_leave", backupId: "b" }, { ...ctx, me: analyst }).availability, "on_leave") // non-admins edit their own availability
})
