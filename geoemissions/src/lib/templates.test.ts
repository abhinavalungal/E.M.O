// Run: node --test src/lib/templates.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanTemplate, fillTemplate, templatesFor, templateValues, unfilled } from "./templates.ts"
import type { Template, Thread, User, Vessel } from "./types.ts"

const user = (p: Partial<User>): User => ({ id: "u", name: "U", email: "u@geoserves.com", role: "analyst", initials: "U", ...p })

test("placeholders are filled from values; unknown or empty ones stay for the sender", () => {
  assert.equal(fillTemplate("Hi {{contact.first_name}}, {{ vessel.name }} {{x}}", { "contact.first_name": "Ana", "vessel.name": "" }), "Hi Ana, {{ vessel.name }} {{x}}")
  assert.deepEqual(unfilled("Hi Ana, {{ vessel.name }} {{x}} {{x}}"), ["vessel.name", "x"])
})

test("users get their own templates and shared ones for their role, own first", () => {
  const t = (p: Partial<Template>): Template => ({ id: p.name!, name: "", category: "other", body: "", ...p })
  const list = [t({ name: "shared-all" }), t({ name: "shared-commercial", roles: ["commercial"] }), t({ name: "shared-analyst", roles: ["analyst"] }), t({ name: "mine", ownerId: "me" }), t({ name: "theirs", ownerId: "x" })]
  assert.deepEqual(templatesFor(list, user({ id: "me" })).map((x) => x.name), ["mine", "shared-all", "shared-analyst"])
})

test("anyone saves personal templates; only admins share them, and only with real roles", () => {
  const me = user({ id: "me" })
  const roles = ["analyst", "commercial"]
  assert.deepEqual(cleanTemplate({ name: " Chase BDN ", category: "bdn", body: "Hi {{contact.first_name}}", shared: false, roles: ["analyst"] }, { me, admin: false, roles }), {
    name: "Chase BDN",
    category: "bdn",
    body: "Hi {{contact.first_name}}",
    ownerId: "me",
    roles: null,
  })
  assert.deepEqual(cleanTemplate({ id: "t1", name: "N", category: "nope", body: "B", shared: true, roles: ["analyst", "boss"] }, { me, admin: true, roles, existing: { id: "t1", name: "", category: "other", body: "" } }), {
    id: "t1",
    name: "N",
    category: "other",
    body: "B",
    ownerId: null,
    roles: ["analyst"],
  })
  assert.throws(() => cleanTemplate({ name: "N", category: "bdn", body: "B", shared: true, roles: [] }, { me, admin: false, roles }), /admin/)
  assert.throws(() => cleanTemplate({ id: "t1", name: "N", category: "bdn", body: "B", shared: false, roles: [] }, { me, admin: false, roles, existing: { id: "t1", name: "", category: "bdn", body: "", ownerId: "x" } }), /own/)
  assert.throws(() => cleanTemplate({ id: "t1", name: "N", category: "bdn", body: "B", shared: false, roles: [] }, { me, admin: false, roles, existing: { id: "t1", name: "", category: "bdn", body: "" } }), /admin/) // a shared one
  assert.throws(() => cleanTemplate({ name: "", category: "bdn", body: "B", shared: false, roles: [] }, { me, admin: false, roles }), /Name/)
  assert.throws(() => cleanTemplate({ name: "N", category: "bdn", body: " ", shared: false, roles: [] }, { me, admin: false, roles }), /text/)
})

test("template values come from the thread's contact, vessel, voyage, customer and PIC", () => {
  const thread = {
    subject: "Noon report NAVI MOON",
    assigneeId: "p",
    messages: [
      { direction: "in", from: { name: "Ana Lima", email: "ana@owner.com" }, at: "2026-10-20T00:00:00Z" },
      { direction: "out", from: { name: "GeoServe", email: "x" }, at: "2026-10-21T00:00:00Z" },
    ],
  } as unknown as Thread
  const vessel: Vessel = { imo: "9385154", name: "Navi Moon", code: "NAMO", voyage: { no: "052026", eta: "2026-10-18" }, location: "At Sea" }
  const v = templateValues(thread, { vessel, customer: { name: "Navi Shipping" }, pic: user({ name: "Priya Nair" }), me: user({ name: "Ben Cole" }), now: Date.parse("2026-10-22T06:30:00Z") })
  assert.deepEqual(v, {
    "contact.name": "Ana Lima",
    "contact.first_name": "Ana",
    "contact.email": "ana@owner.com",
    "customer.name": "Navi Shipping",
    "vessel.name": "Navi Moon",
    "vessel.imo": "9385154",
    "vessel.code": "NAMO",
    "vessel.location": "At Sea",
    "voyage.no": "052026",
    "voyage.eta": "18 Oct 2026",
    "pic.name": "Priya Nair",
    "my.name": "Ben Cole",
    "thread.subject": "Noon report NAVI MOON",
    today: "22 Oct 2026",
  })
})
