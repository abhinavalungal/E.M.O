// Turns a plain-English command-bar query into visible inbox filter chips.
// ponytail: keyword rules stand in for the LLM query parser; the chip output format stays the same.
import { CATEGORIES } from "./data"
import type { Category, Org, Vessel } from "./types"

export type InboxFilters = {
  view?: string
  cat?: Category
  vessel?: string
  customer?: string
  date?: "today" | "7d"
  q?: string
}

const CAT_WORDS: [RegExp, Category][] = [
  [/allocation confirm/i, "allocation_confirmation"],
  [/\bbdns?\b|bunker delivery/i, "bdn"],
  [/noon|vessel reports?|voyage reports?|arrival reports?/i, "vessel_report"],
  [/allocation/i, "allocation"],
  [/invoices?/i, "invoice"],
  [/fuel ?eu/i, "fueleu"],
  [/\bmrv\b/i, "eu_mrv"],
  [/\bdcs\b/i, "imo_dcs"],
  [/seemp|\bcii\b/i, "seemp"],
  [/uk ?ets|\buka\b/i, "uk_ets"],
  [/eu ?ets|surrender/i, "eu_ets"],
  [/carbon|trades?|\beua\b/i, "carbon_trading"],
  [/quer(y|ies)|questions?/i, "customer_query"],
]

const VIEW_WORDS: [RegExp, string, string][] = [
  [/unanswered|pending|open|requires? action|to do/, "action", "Requires action"],
  [/waiting/, "waiting", "Waiting"],
  [/\bmy\b|\bmine\b|assigned to me/, "mine", "My queue"],
  [/unassigned/, "unassigned", "Unassigned"],
  [/resolved|closed|done/, "resolved", "Resolved"],
]

export function parseQuery(text: string, known: { vessels: Vessel[]; customers: Org[] }): { filters: InboxFilters; chips: string[] } {
  const filters: InboxFilters = {}
  const chips: string[] = []
  const t = text.toLowerCase()

  const cat = CAT_WORDS.find(([re]) => re.test(t))?.[1]
  if (cat) {
    filters.cat = cat
    chips.push(CATEGORIES[cat].label)
  }

  const date = /\btoday\b/.test(t) ? "today" : /this week|last 7|past week/.test(t) ? "7d" : undefined
  if (date) {
    filters.date = date
    chips.push(date === "today" ? "Received today" : "Last 7 days")
  }

  const view = VIEW_WORDS.find(([re]) => re.test(t))
  if (view) {
    filters.view = view[1]
    chips.push(view[2])
  }

  const words = t.split(/[^a-z0-9]+/)
  const imo = t.match(/\b\d{7}\b/)?.[0]
  const vessels = known.vessels
  const vessel =
    vessels.find((v) => v.imo === imo) ??
    vessels.find((v) => t.includes(v.name.toLowerCase().replace(/^(mv|mt)\s+/, ""))) ?? // full name without MV/MT
    vessels.find((v) => words.includes(v.name.toLowerCase().split(" ").at(-1)!)) // distinctive last word, e.g. "aurora"
  if (vessel) {
    filters.vessel = vessel.imo
    chips.push(vessel.name)
  } else {
    const customer = known.customers.find((c) => t.includes(c.short.toLowerCase()))
    if (customer) {
      filters.customer = customer.id
      chips.push(customer.short)
    }
  }
  return { filters, chips }
}

export function inboxHref(f: InboxFilters & { t?: string }) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `/inbox?${s}` : "/inbox"
}
