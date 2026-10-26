// Reply templates: personal ones per user, shared ones per role, with {{placeholders}} filled from the thread.
import { CATEGORIES } from "./data.ts"
import { fmtDate } from "./format.ts"
import type { Category, Template, Thread, User, Vessel } from "./types"

/** Placeholders the composer fills from the thread; anything else stays in the text for the sender to complete. */
export const PLACEHOLDERS = [
  "contact.first_name",
  "contact.name",
  "contact.email",
  "customer.name",
  "vessel.name",
  "vessel.imo",
  "vessel.code",
  "vessel.location",
  "voyage.no",
  "voyage.eta",
  "pic.name",
  "my.name",
  "thread.subject",
  "today",
]

const TAG = /\{\{\s*([\w.]+)\s*\}\}/g

export const fillTemplate = (body: string, values: Record<string, string | undefined>) => body.replace(TAG, (tag, key: string) => values[key] || tag)

/** Placeholders still in a body, e.g. to warn before sending. */
export const unfilled = (body: string) => [...new Set([...body.matchAll(TAG)].map((m) => m[1]))]

/** The user's own templates, then shared ones open to everyone or to their role. */
export const templatesFor = (templates: Template[], me: User) => [
  ...templates.filter((t) => t.ownerId === me.id),
  ...templates.filter((t) => !t.ownerId && (!t.roles?.length || t.roles.includes(me.role))),
]

/** Validates a template save (server actions are public endpoints): your own templates are yours; shared ones need an admin. */
export function cleanTemplate(
  t: { id?: string; name: string; category: string; body: string; shared: boolean; roles: string[] },
  c: { me: User; admin: boolean; roles: string[]; existing?: Template },
) {
  const name = String(t.name ?? "").trim().slice(0, 80)
  const body = String(t.body ?? "").slice(0, 10_000)
  if (!name) throw new Error("Name is required")
  if (!body.trim()) throw new Error("The template has no text")
  if (c.existing?.ownerId && c.existing.ownerId !== c.me.id) throw new Error("You can only edit your own templates")
  if ((t.shared || (c.existing && !c.existing.ownerId)) && !c.admin) throw new Error("Only admins can edit shared templates")
  return {
    ...(t.id && { id: t.id }),
    name,
    category: (t.category in CATEGORIES ? t.category : "other") as Category,
    body,
    ownerId: t.shared ? null : c.me.id,
    roles: t.shared ? t.roles.filter((r) => c.roles.includes(r)) : null,
  }
}

export function templateValues(t: Thread, c: { vessel?: Vessel; customer?: { name: string }; pic?: User; me: User; now?: number }): Record<string, string | undefined> {
  const contact = [...t.messages].reverse().find((m) => m.direction === "in")?.from
  const v = c.vessel
  return {
    "contact.name": contact?.name,
    "contact.first_name": contact?.name.split(" ")[0],
    "contact.email": contact?.email,
    "customer.name": c.customer?.name,
    "vessel.name": v?.name,
    "vessel.imo": v?.imo,
    "vessel.code": v?.code,
    "vessel.location": v?.location,
    "voyage.no": v?.voyage?.no,
    "voyage.eta": v?.voyage?.eta && fmtDate(v.voyage.eta),
    "pic.name": c.pic?.name,
    "my.name": c.me.name,
    "thread.subject": t.subject,
    today: fmtDate(new Date(c.now ?? Date.now()).toISOString()),
  }
}
