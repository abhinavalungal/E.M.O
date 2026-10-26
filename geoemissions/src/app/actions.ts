"use server"

// Every write the app makes. Each validates its input (these are public HTTP endpoints) and appends to the audit log.
// ponytail: the actor is whoever is picked in "Signed in as" — no real authentication until Entra ID sign-in lands.
import { cookies } from "next/headers"
import { CAPABILITIES, MAILBOX } from "@/lib/data"
import { remove, select, update, upsert } from "@/lib/db"
import { syncMail } from "@/lib/sync"
import { can, cleanRole, cleanUser, type UserInput } from "@/lib/team"
import { cleanTemplate } from "@/lib/templates"
import type { Alert, Availability, Capability, EscalationPolicy, Label, Priority, RoleConfig, SavedView, Status, Template, User } from "@/lib/types"

const STATUSES: Status[] = ["new", "open", "waiting_customer", "waiting_internal", "resolved"]
const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"]

const enc = encodeURIComponent

/** The acting user (active only); with `cap`, their role must have that capability. */
async function actor(id: string, cap?: Capability) {
  const [u] = await select<User>("users", `id=eq.${enc(id)}`)
  if (!u || u.active === false) throw new Error("Unknown user")
  if (cap && !can(await roleOf(u), cap)) throw new Error(`Your role doesn't allow this: ${CAPABILITIES[cap].label}`)
  return u
}

const roleOf = async (u: User) => (await select<RoleConfig>("roles", `id=eq.${enc(u.role)}`))[0]

const log = (actorId: string, action: string, target: string, href?: string) => upsert("activity", { actorId, action, target, href })

export type ThreadPatch = {
  status?: Status
  priority?: Priority
  important?: boolean
  assigneeId?: string | null
  labels?: Label[]
  needsReview?: boolean
  snoozedUntil?: string | null
  unread?: boolean
}

export async function saveThread(actorId: string, threadId: string, subject: string, patch: ThreadPatch) {
  const me = await actor(actorId, patch.assigneeId && patch.assigneeId !== actorId ? "thread.assign" : undefined)
  if (patch.status && !STATUSES.includes(patch.status)) throw new Error("Bad status")
  if (patch.priority && !PRIORITIES.includes(patch.priority)) throw new Error("Bad priority")
  const { unread, ...rest } = patch
  const row = {
    id: String(threadId),
    ...rest,
    ...(unread === false && { readAt: new Date().toISOString() }),
    ...(unread === true && { readAt: null }),
    updatedAt: new Date().toISOString(),
  }
  await upsert("thread_state", row)

  const href = `/inbox?view=all&t=${encodeURIComponent(threadId)}`
  if (patch.assigneeId !== undefined) {
    const who = patch.assigneeId ? (await actor(patch.assigneeId)).name : null
    await log(me.id, who ? `assigned ${who} to` : "unassigned", subject, href)
  }
  if (patch.status) await log(me.id, `marked ${patch.status.replace("_", " ")}`, subject, href)
  if (patch.labels) await log(me.id, `classified as ${patch.labels[0]?.category}`, subject, href)
  if (patch.priority) await log(me.id, `set priority ${patch.priority} on`, subject, href)
}

export async function addNote(actorId: string, threadId: string, subject: string, body: string) {
  const me = await actor(actorId)
  const text = body.trim().slice(0, 10_000)
  if (!text) throw new Error("Empty note")
  await upsert("notes", { threadId, authorId: me.id, body: text })
  await log(me.id, "added a note on", subject, `/inbox?view=all&t=${encodeURIComponent(threadId)}`)
}

export async function saveAlert(actorId: string, alert: Pick<Alert, "id" | "title" | "href">, status: Alert["status"], snoozedUntil?: string) {
  const me = await actor(actorId)
  if (!["open", "snoozed", "resolved"].includes(status)) throw new Error("Bad status")
  await upsert("alert_state", { id: alert.id, status, snoozedUntil: snoozedUntil ?? null, updatedAt: new Date().toISOString() })
  await log(me.id, status === "open" ? "reopened alert" : `${status} alert`, alert.title, alert.href)
}

export async function confirmTxn(actorId: string, id: string) {
  const me = await actor(actorId, "commercial.confirm")
  await update("carbon_txns", `id=eq.${encodeURIComponent(id)}&status=eq.proposed`, { status: "confirmed" })
  await log(me.id, "confirmed transaction", id, "/commercial?tab=carbon")
}

export async function confirmAllocation(actorId: string, id: string) {
  const me = await actor(actorId, "commercial.confirm")
  await update("allocations", `id=eq.${encodeURIComponent(id)}`, { status: "confirmed", confirmedAt: new Date().toISOString() })
  await log(me.id, "confirmed allocation", id, "/commercial?tab=allocations")
}

export async function setRuleEnabled(actorId: string, id: string, enabled: boolean) {
  const me = await actor(actorId, "admin")
  await update("rules", `id=eq.${encodeURIComponent(id)}`, { enabled: !!enabled })
  await log(me.id, enabled ? "enabled rule" : "disabled rule", id, "/admin?tab=rules")
}

export async function saveProfile(actorId: string, signature: string, prefs: User["prefs"]) {
  const me = await actor(actorId)
  await update("users", `id=eq.${encodeURIComponent(me.id)}`, { signature: signature.slice(0, 2_000) || null, prefs })
}

export async function saveViews(actorId: string, views: SavedView[]) {
  const me = await actor(actorId)
  const clean = views
    .slice(0, 20)
    .map((v) => ({ name: String(v.name).trim().slice(0, 40), query: new URLSearchParams(String(v.query).slice(0, 500)).toString() }))
    .filter((v) => v.name)
  await update("users", `id=eq.${enc(me.id)}`, { views: clean })
}

export async function saveAvailability(actorId: string, p: { availability: Availability; awayFrom?: string; awayUntil?: string; backupId?: string }) {
  const me = await actor(actorId)
  const [roles, users] = await Promise.all([select<RoleConfig>("roles"), select<User>("users")])
  // Only these four fields come from the browser; the rest of the row is the stored user.
  const row = cleanUser({ ...me, availability: p.availability, awayFrom: p.awayFrom, awayUntil: p.awayUntil, backupId: p.backupId }, { roles, users, me })
  await update("users", `id=eq.${enc(me.id)}`, { availability: row.availability, awayFrom: row.awayFrom, awayUntil: row.awayUntil, backupId: row.backupId })
  const backup = users.find((u) => u.id === row.backupId)?.name ?? "none"
  await log(me.id, "set availability:", `${row.availability.replace("_", " ")}${row.awayUntil ? ` until ${row.awayUntil}` : ""} · backup ${backup}`, "/profile")
}

// ─── Administration ──────────────────────────────────────────────────────────

export async function saveUser(actorId: string, input: UserInput) {
  const me = await actor(actorId, "admin")
  const [roles, users] = await Promise.all([select<RoleConfig>("roles"), select<User>("users")])
  const row = cleanUser(input, { roles, users, me })
  await upsert("users", row)
  await log(me.id, !input.id ? "added user" : row.active ? "updated user" : "removed user", row.name, "/admin?tab=roles")
}

export async function saveRole(actorId: string, input: { id?: string; label: string; categories: string[]; capabilities: string[] }) {
  const me = await actor(actorId, "admin")
  const role = cleanRole(input, me)
  if (!input.id && (await select<RoleConfig>("roles", `id=eq.${enc(role.id)}`)).length) throw new Error(`A role called ${role.label} already exists`)
  await upsert("roles", role)
  await log(me.id, input.id ? "updated role" : "added role", role.label, "/admin?tab=roles")
}

export async function saveEscalationPolicy(actorId: string, p: EscalationPolicy) {
  const me = await actor(actorId, "admin")
  const hours = Math.round(Number(p.hours))
  if (!(hours >= 1 && hours <= 720)) throw new Error("Hours must be between 1 and 720")
  await upsert("settings", { id: "escalation", value: { hours, reassign: !!p.reassign } })
  await log(me.id, "set the escalation policy:", `after ${hours}h ${p.reassign ? "reassign to the backup" : "alert only"}`, "/admin?tab=slas")
}

// ─── Templates ───────────────────────────────────────────────────────────────

async function templateContext(me: User, id?: string) {
  const [roles, existing] = await Promise.all([select<RoleConfig>("roles"), id ? select<Template>("templates", `id=eq.${enc(id)}`) : []])
  if (id && !existing[0]) throw new Error("Template not found")
  return { me, admin: can(roles.find((r) => r.id === me.role), "admin"), roles: roles.map((r) => r.id), existing: existing[0] }
}

export async function saveTemplate(actorId: string, t: { id?: string; name: string; category: string; body: string; shared: boolean; roles: string[] }) {
  const me = await actor(actorId)
  const row = cleanTemplate(t, await templateContext(me, t.id))
  await upsert("templates", row)
  await log(me.id, `${t.id ? "updated" : "created"} ${row.ownerId ? "personal" : "shared"} template`, row.name, row.ownerId ? "/profile#templates" : "/admin?tab=templates")
}

export async function deleteTemplate(actorId: string, id: string) {
  const me = await actor(actorId)
  const c = await templateContext(me, id)
  const t = c.existing!
  cleanTemplate({ ...t, shared: !t.ownerId, roles: t.roles ?? [] }, c) // same ownership rules as editing
  await remove("templates", `id=eq.${enc(id)}`)
  await log(me.id, "deleted template", t.name, t.ownerId ? "/profile#templates" : "/admin?tab=templates")
}

// ─── Mailbox ─────────────────────────────────────────────────────────────────

/** Sync now: the same one-off sync the app runs hourly. Returns the error rather than throwing, so it reaches the screen. */
export async function syncNow(actorId: string) {
  const me = await actor(actorId)
  const error = await syncMail()
  await log(me.id, error ? "ran a mailbox sync that failed:" : "synced the mailbox", error ?? MAILBOX, "/admin?tab=integrations")
  return { error }
}

/** Remembers who is using this browser until real sign-in exists. */
export async function setCurrentUser(userId: string) {
  await actor(userId)
  ;(await cookies()).set("uid", userId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
}
