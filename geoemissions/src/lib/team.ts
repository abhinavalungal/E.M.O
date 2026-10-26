// Who sees and handles which mail: role-based visibility, availability and backups, and the escalation policy.
// Pure functions shared by the browser, the server actions and the automation run on page loads.
import { CAPABILITIES, CATEGORIES } from "./data.ts"
import type { Capability, Category, EscalationPolicy, RoleConfig, Thread, User } from "./types"

const HOUR = 3_600_000
const istDay = (date: string) => Date.parse(`${date}T00:00:00+05:30`)

export const can = (role: RoleConfig | undefined, cap: Capability) => !!role?.capabilities.includes(cap)

/** Who is using the app: the user picked in "Signed in as" while still active, else the lead admin, else the first active user. */
export function viewer(users: User[], roles: RoleConfig[], uid?: string) {
  const active = users.filter((u) => u.active !== false)
  return (
    active.find((u) => u.id === uid) ??
    active.find((u) => u.lead && can(roles.find((r) => r.id === u.role), "admin")) ??
    active[0]
  )
}

/** On leave or unavailable now. Dates are IST days, both inclusive; a missing date leaves that end open. */
export function isAway(u: User, now = Date.now()) {
  if (!u.availability || u.availability === "available") return false
  return (!u.awayFrom || istDay(u.awayFrom) <= now) && (!u.awayUntil || now < istDay(u.awayUntil) + 24 * HOUR)
}

/** Who handles an assignee's mail now: the assignee, or their backup while they are away or removed (if the backup is around). */
export function coverFor(assigneeId: string | undefined, users: User[], now = Date.now()) {
  const a = users.find((u) => u.id === assigneeId)
  if (!a) return undefined
  if (a.active !== false && !isAway(a, now)) return a
  const b = users.find((u) => u.id === a.backupId)
  return b && b.active !== false && !isAway(b, now) ? b : undefined
}

/** Mail a user may see: everything with mail.all, else their role's categories plus mail assigned to them or to whoever they back up. */
export function canSee(t: Thread, me: User, role: RoleConfig | undefined, users: User[]) {
  if (can(role, "mail.all") || t.assigneeId === me.id) return true
  if (t.assigneeId && users.find((u) => u.id === t.assigneeId)?.backupId === me.id) return true
  return !!role && t.labels.some((l) => role.categories.includes(l.category))
}

/** Hours since the oldest message we haven't answered, while the thread waits on us; undefined otherwise. */
export function unansweredHours(t: Thread, now = Date.now()) {
  if (!(t.status === "new" || t.status === "open") || (t.snoozedUntil && Date.parse(t.snoozedUntil) > now)) return undefined
  let since: string | undefined
  for (let i = t.messages.length - 1; i >= 0 && t.messages[i].direction === "in"; i--) since = t.messages[i].at
  return since ? (now - Date.parse(since)) / HOUR : undefined
}

export type Escalation = { threadId: string; subject: string; from: string; to: string; original: string; reason: string }

/** Threads automation moves to the assignee's backup: the assignee is away, or nobody answered within the policy hours. Once per thread. */
export function planEscalations(threads: Thread[], users: User[], policy: EscalationPolicy, now = Date.now()): Escalation[] {
  if (!policy.reassign) return []
  return threads.flatMap((t) => {
    const a = users.find((u) => u.id === t.assigneeId)
    const h = unansweredHours(t, now)
    if (!a || t.escalatedAt || h === undefined) return []
    const away = a.active === false || isAway(a, now)
    const b = users.find((u) => u.id === a.backupId)
    if (!(away || h >= policy.hours) || !b || b.id === a.id || b.active === false || isAway(b, now)) return []
    return [{ threadId: t.id, subject: t.subject, from: a.id, to: b.id, original: t.originalAssigneeId ?? a.id, reason: away ? `${a.name} is away` : `unanswered for ${Math.round(h)}h` }]
  })
}

// ─── Validation of admin edits (server actions are public endpoints) ─────────────

const AVAILABILITY = ["available", "on_leave", "unavailable"]
const DATE = /^\d{4}-\d{2}-\d{2}$/

export type UserInput = Partial<Pick<User, "id" | "initials" | "lead" | "active" | "backupId" | "availability" | "awayFrom" | "awayUntil">> & {
  name: string
  email: string
  role: string
}

export function cleanUser(u: UserInput, { roles, users, me }: { roles: RoleConfig[]; users: User[]; me: User }) {
  const name = String(u.name ?? "").trim().slice(0, 100)
  const email = String(u.email ?? "").trim().toLowerCase()
  if (!name) throw new Error("Name is required")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address")
  const role = roles.find((r) => r.id === u.role)
  if (!role) throw new Error("Pick a role from the roles list")
  if (u.backupId && (u.backupId === u.id || !users.some((x) => x.id === u.backupId))) throw new Error("The backup must be another team member")
  const availability = u.availability ?? "available"
  if (!AVAILABILITY.includes(availability)) throw new Error("Unknown availability")
  const awayFrom = u.awayFrom || null
  const awayUntil = u.awayUntil || null
  if ([awayFrom, awayUntil].some((d) => d && !DATE.test(d)) || (awayFrom && awayUntil && awayFrom > awayUntil))
    throw new Error("The away dates are not valid: 'from' must be on or before 'until'")
  const active = u.active !== false
  const isAdmin = can(roles.find((r) => r.id === me.role), "admin")
  if (u.id === me.id && isAdmin && (!active || !can(role, "admin"))) throw new Error("You can't remove your own admin access")
  const initials = (u.initials?.trim() || name.split(/\s+/).map((w) => w[0]).join("")).slice(0, 3).toUpperCase()
  return { ...(u.id && { id: u.id }), name, email, role: role.id, initials, lead: !!u.lead, active, backupId: u.backupId || null, availability, awayFrom, awayUntil }
}

export function cleanRole(r: { id?: string; label: string; categories: string[]; capabilities: string[] }, me: User): RoleConfig {
  const label = String(r.label ?? "").trim().slice(0, 60)
  if (!label) throw new Error("Name is required")
  const id = r.id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const capabilities = r.capabilities.filter((c): c is Capability => c in CAPABILITIES)
  if (id === me.role && !capabilities.includes("admin")) throw new Error("You can't remove your own admin access")
  return { id, label, categories: r.categories.filter((c): c is Category => c in CATEGORIES), capabilities }
}
