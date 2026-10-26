// Turns Outlook messages (synced into Supabase by `python outlook-pipeline.py sync`) into inbox threads,
// linked to orgs/vessels, classified by the rules table and overlaid with the team's saved triage state.
import { SLA_HOURS } from "./data.ts"
import { extractImos } from "./imo.ts"
import { listedAttachments } from "./mail-html.ts"
import type { Label, Note, Org, Priority, Rule, Status, Thread, Vessel } from "./types"

type Address = { emailAddress: { name?: string; address?: string } }

export type GraphMessage = {
  id: string
  conversationId: string
  subject: string | null
  from?: Address
  toRecipients: Address[]
  ccRecipients: Address[]
  receivedDateTime: string
  isRead: boolean
  importance: "low" | "normal" | "high"
  flag?: { flagStatus: string }
  body?: { content: string } // not loaded for the inbox list; an opened email is fetched from Graph
  bodyPreview: string
  attachments?: { id?: string; name: string; size: number; isInline: boolean; contentType?: string; contentId?: string }[]
  folder: "inbox" | "sentitems"
}

/** A row of the thread_state table: what the team changed on a conversation. */
export type ThreadState = {
  id: string
  status?: Status
  priority?: Priority
  important?: boolean
  assigneeId?: string
  originalAssigneeId?: string
  escalatedAt?: string
  labels?: Label[]
  needsReview?: boolean
  snoozedUntil?: string
  readAt?: string
  updatedAt: string
}

export type MailContext = {
  orgs: Org[]
  vessels: Vessel[]
  rules: Rule[]
  states: ThreadState[]
  notes: (Note & { threadId: string })[]
  reports?: { imo: string; messageId?: string }[] // vessel reports the pipeline matched to an email
}

const address = (a?: Address) => a?.emailAddress.address ?? ""
const domain = (email: string) => email.split("@")[1]?.toLowerCase() ?? ""
const fileSize = (n: number) => (n < 1_048_576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
const shortName = (name: string) => name.replace(/^(MV|MT|M\/V|M\/T)\s+/i, "").toLowerCase()

function compile(rules: Rule[]) {
  return rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.position - b.position)
    .flatMap((r) => {
      try {
        return [{ rule: r, re: new RegExp(r.pattern, "i") }]
      } catch {
        return [] // a bad pattern typed into the rules table must not break the inbox
      }
    })
}

export function toThreads(messages: GraphMessage[], ctx: MailContext): Thread[] {
  const rules = compile(ctx.rules)
  const states = new Map(ctx.states.map((s) => [s.id, s]))
  const known = new Map(ctx.vessels.map((v) => [v.imo, v]))

  return [...Map.groupBy(messages, (m) => m.conversationId).values()].map((ms): Thread => {
    ms.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime))
    const last = ms[ms.length - 1]
    const s = states.get(last.conversationId)
    const files = (m: GraphMessage) => listedAttachments(m.attachments ?? [], m.body?.content) // not logos / images shown in the body
    const ids = new Set(ms.map((m) => m.id))

    const names = ms.map((m) => [m.subject, ...files(m).map((a) => a.name)].join(" ")).join(" ").replace(/_/g, " ") // so \b splits BDN_x.pdf
    const hit = rules.find(({ re }) => re.test(names))?.rule
    const label: Label = hit
      ? { category: hit.category, confidence: hit.confidence, source: "rule", ruleId: hit.id }
      : { category: "other", confidence: 0, source: "rule" }

    // The other party: sender of inbound mail, first recipient of ours.
    const domains = ms.map((m) => domain(m.folder === "inbox" ? address(m.from) : address(m.toRecipients[0])))
    const org = ctx.orgs.find((o) => domains.some((d) => d === o.domain.toLowerCase() || d.endsWith("." + o.domain.toLowerCase())))
    const text = ms.map((m) => `${m.subject ?? ""}\n${m.body?.content ?? m.bodyPreview}`).join("\n")
    const subjects = ms.map((m) => m.subject ?? "").join(" ").toLowerCase()
    const imos = [
      ...new Set([
        ...extractImos(text).filter((i) => known.has(i)),
        ...(ctx.reports ?? []).filter((r) => r.messageId && ids.has(r.messageId) && known.has(r.imo)).map((r) => r.imo),
        ...ctx.vessels.filter((v) => subjects.includes(shortName(v.name))).map((v) => v.imo),
      ]),
    ]

    const inbound = ms.filter((m) => m.folder === "inbox")
    const lastIn = inbound.at(-1)?.receivedDateTime
    const unread = inbound.some((m) => !m.isRead && (!s?.readAt || m.receivedDateTime > s.readAt))
    const mailStatus: Status = last.folder === "sentitems" ? "waiting_customer" : unread ? "new" : "open"
    // A new customer message after the team parked the thread reopens it.
    const reopened = !!s?.status && !!lastIn && lastIn > s.updatedAt && ["resolved", "waiting_customer", "waiting_internal"].includes(s.status)
    const status = s?.status && !reopened ? s.status : mailStatus
    const awaitingUs = last.folder === "inbox" && (status === "new" || status === "open")

    return {
      id: last.conversationId,
      subject: ms[0].subject || "(no subject)",
      orgId: org?.id ?? "",
      customerId: org?.kind === "customer" ? org.id : undefined,
      vesselImos: imos,
      labels: s?.labels?.length ? s.labels : [label],
      status,
      priority: s?.priority ?? (ms.some((m) => m.importance === "high") ? "high" : "medium"),
      important: s?.important ?? ms.some((m) => m.flag?.flagStatus === "flagged"),
      unread,
      needsReview: s?.needsReview,
      assigneeId: s?.assigneeId,
      originalAssigneeId: s?.originalAssigneeId,
      escalatedAt: s?.escalatedAt,
      snoozedUntil: s?.snoozedUntil,
      // SLA applies to customer emails still waiting on us.
      slaDueAt: awaitingUs && org?.kind === "customer" ? new Date(Date.parse(last.receivedDateTime) + SLA_HOURS * 3_600_000).toISOString() : undefined,
      messages: ms.map((m) => ({
        id: m.id,
        direction: m.folder === "sentitems" ? "out" : "in",
        from: { name: m.from?.emailAddress.name || address(m.from), email: address(m.from) },
        to: m.toRecipients.map(address),
        cc: m.ccRecipients.map(address),
        at: m.receivedDateTime,
        // Outlook's text rendering leaves "[cid:image001.png@…]" where images were; the HTML view shows the images.
        body: (m.body?.content ?? m.bodyPreview).replace(/\[cid:[^\]\s]+\]/gi, "").trim(),
        attachments: files(m).map((a) => ({ id: a.id, name: a.name, size: fileSize(a.size), kind: a.name.split(".").pop()!.toLowerCase() })),
      })),
      intel: { summary: last.bodyPreview, extracted: [] },
      notes: ctx.notes.filter((n) => n.threadId === last.conversationId).sort((a, b) => a.at.localeCompare(b.at)),
    }
  })
}
