// Run: node --test src/lib/mail.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { toThreads, type GraphMessage, type MailContext } from "./mail.ts"
import type { Org, Rule, Vessel } from "./types.ts"

const msg = (p: Partial<GraphMessage>): GraphMessage => ({
  id: "m",
  conversationId: "c1",
  subject: "Hello",
  from: { emailAddress: { name: "Ops", address: "ops@example.com" } },
  toRecipients: [{ emailAddress: { address: "Geoemissions@geoserves.com" } }],
  ccRecipients: [],
  receivedDateTime: "2026-10-14T08:00:00Z",
  isRead: true,
  importance: "normal",
  body: { content: " Body \n" },
  bodyPreview: "Body",
  folder: "inbox",
  ...p,
})

const rule = (id: string, pattern: string, category: Rule["category"], position: number): Rule => ({ id, name: id, pattern, category, confidence: 0.9, enabled: true, position })
const RULES = [rule("R-1", "\\bBDN\\b|bunker delivery", "bdn", 1), rule("R-2", "noon report", "vessel_report", 2), rule("R-3", "([", "invoice", 0)]
const ORG: Org = { id: "c1", name: "Aegean Crest Shipping", short: "Aegean Crest", domain: "aegeancrest.gr", country: "Greece", kind: "customer" }
const VESSEL = { imo: "9074729", name: "MV Aegean Star", customerId: "c1" } as Vessel
const ctx = (p: Partial<MailContext> = {}): MailContext => ({ orgs: [], vessels: [], rules: RULES, states: [], notes: [], ...p })

test("groups a conversation across inbox and sent items, oldest first", () => {
  const [t, ...rest] = toThreads(
    [msg({ id: "b", folder: "sentitems", receivedDateTime: "2026-10-14T09:00:00Z", bodyPreview: "Reply" }), msg({ id: "a", subject: "BDN – MV Test", isRead: false })],
    ctx(),
  )
  assert.equal(rest.length, 0)
  assert.deepEqual(t.messages.map((m) => [m.id, m.direction]), [["a", "in"], ["b", "out"]])
  assert.equal(t.status, "waiting_customer") // last message is ours
  assert.equal(t.unread, true)
  assert.equal(t.intel.summary, "Reply")
  assert.equal(t.messages[0].body, "Body")
})

test("classifies with enabled rules in order; a broken pattern is skipped; inline images are ignored", () => {
  const cat = (p: Partial<GraphMessage>, rules = RULES) => toThreads([msg(p)], ctx({ rules }))[0].labels[0]
  assert.deepEqual(cat({ subject: "Noon report 14 Oct" }), { category: "vessel_report", confidence: 0.9, source: "rule", ruleId: "R-2" })
  assert.equal(cat({ subject: "Docs", attachments: [{ name: "BDN_Fujairah.pdf", size: 2048, isInline: false }] }).category, "bdn")
  assert.equal(cat({ subject: "Hi", attachments: [{ name: "BDN-logo.png", size: 10, isInline: true }] }).category, "other")
  assert.equal(cat({ subject: "Noon report" }, [{ ...RULES[1], enabled: false }]).category, "other")

  const [m] = toThreads([msg({ attachments: [{ id: "a1", name: "Report.XLSX", size: 3_145_728, isInline: false }] })], ctx())[0].messages
  assert.deepEqual(m.attachments, [{ id: "a1", name: "Report.XLSX", size: "3.0 MB", kind: "xlsx" }])
})

test("images shown in the body are not listed again and their [cid:] placeholders are dropped from the text", () => {
  const [m] = toThreads(
    [
      msg({
        body: { content: "Regards\n[cid:image001.png@01DD5C9D.C7BB88C0]\nGeoServe" },
        attachments: [
          { id: "a1", name: "image001.png", size: 900, isInline: false, contentId: "<image001.png@01DD5C9D.C7BB88C0>" }, // referenced, not flagged inline
          { id: "a2", name: "photo.jpg", size: 900, isInline: false, contentId: "other@x" },
        ],
      }),
    ],
    ctx(),
  )[0].messages
  assert.equal(m.body, "Regards\n\nGeoServe")
  assert.deepEqual(m.attachments?.map((a) => a.name), ["photo.jpg"])
})

test("links the sender domain to an org and IMOs / names to known vessels; customer mail gets an SLA", () => {
  const [t] = toThreads(
    [msg({ from: { emailAddress: { address: "ops@fleet.aegeancrest.gr" } }, subject: "Aegean Star arrival", body: { content: "IMO 9074729 and IMO 9176187" } })],
    ctx({ orgs: [ORG], vessels: [VESSEL] }),
  )
  assert.equal(t.orgId, "c1")
  assert.equal(t.customerId, "c1")
  assert.deepEqual(t.vesselImos, ["9074729"]) // 9176187 is valid but not in the vessels table
  assert.equal(t.slaDueAt, "2026-10-14T16:00:00.000Z") // received + 8h
  assert.equal(toThreads([msg({})], ctx({ orgs: [ORG] }))[0].slaDueAt, undefined)
})

test("saved triage state overrides the mail, until the customer writes again", () => {
  const state = { id: "c1", status: "resolved" as const, assigneeId: "u2", priority: "urgent" as const, readAt: "2026-10-14T08:30:00Z", updatedAt: "2026-10-14T08:30:00Z", originalAssigneeId: "u1", escalatedAt: "2026-10-14T08:00:00Z" }
  const [t] = toThreads([msg({ isRead: false })], ctx({ states: [state], notes: [{ id: "n", threadId: "c1", authorId: "u2", at: "2026-10-14T08:31:00Z", body: "done" }] }))
  assert.deepEqual([t.status, t.assigneeId, t.priority, t.unread, t.notes.length], ["resolved", "u2", "urgent", false, 1])
  assert.deepEqual([t.originalAssigneeId, t.escalatedAt], ["u1", "2026-10-14T08:00:00Z"]) // who had it before automation moved it

  const [r] = toThreads([msg({}), msg({ id: "n2", isRead: false, receivedDateTime: "2026-10-14T10:00:00Z" })], ctx({ states: [state] }))
  assert.deepEqual([r.status, r.unread, r.assigneeId], ["new", true, "u2"])
})

test("without bodies (the list query), text is the preview, IMOs come from the preview and stored vessel reports, and cid images aren't listed", () => {
  const VESSEL2 = { imo: "9385154", name: "Navi Moon" } as Vessel
  const [t] = toThreads(
    [
      msg({
        body: undefined,
        bodyPreview: "Noon report attached [cid:image001.png@01DD] IMO 9074729",
        attachments: [
          { id: "a1", name: "image001.png", size: 900, isInline: false, contentId: "image001.png@01DD", contentType: "image/png" },
          { id: "a2", name: "noon.pdf", size: 900, isInline: false, contentId: "x@y", contentType: "application/pdf" },
        ],
      }),
    ],
    ctx({ vessels: [VESSEL, VESSEL2], reports: [{ imo: "9385154", messageId: "m" }] }),
  )
  assert.equal(t.messages[0].body, "Noon report attached  IMO 9074729")
  assert.deepEqual(t.vesselImos, ["9074729", "9385154"])
  assert.deepEqual(t.messages[0].attachments?.map((a) => a.name), ["noon.pdf"])
})
