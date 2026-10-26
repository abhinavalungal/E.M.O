// App configuration: taxonomy, roles and policy. All records (team, customers, vessels, compliance,
// commercial, mail) come from Supabase via lib/workspace.ts — nothing here is sample data.
import type { Capability, Category, Group, Regulation } from "./types"

export const MAILBOX = "Geoemissions@geoserves.com"
/** First-response target for customer emails, in hours. */
export const SLA_HOURS = 8
/** The app syncs the mailbox itself once the last sync is this old; Sync now runs it any time. */
export const SYNC_EVERY_MS = 3_600_000

// ─── Taxonomy ────────────────────────────────────────────────────────────────

export const GROUPS: Record<Group, { label: string }> = {
  reports: { label: "Reports" },
  commercial: { label: "Commercial" },
  regulatory: { label: "Regulatory" },
  queries: { label: "Customer queries" },
  other: { label: "Other" },
}

export const CATEGORIES: Record<Category, { label: string; group: Group }> = {
  vessel_report: { label: "Vessel report", group: "reports" },
  bdn: { label: "BDN", group: "reports" },
  allocation: { label: "Allocation", group: "commercial" },
  allocation_confirmation: { label: "Allocation confirmation", group: "commercial" },
  invoice: { label: "Invoice", group: "commercial" },
  carbon_trading: { label: "Carbon trading", group: "commercial" },
  customer_query: { label: "Customer query", group: "queries" },
  imo_dcs: { label: "IMO DCS", group: "regulatory" },
  eu_mrv: { label: "EU MRV", group: "regulatory" },
  fueleu: { label: "FuelEU", group: "regulatory" },
  seemp: { label: "SEEMP / CII", group: "regulatory" },
  eu_ets: { label: "EU ETS", group: "regulatory" },
  uk_ets: { label: "UK ETS", group: "regulatory" },
  other: { label: "Other", group: "other" },
}

export const REGULATIONS: Record<Regulation, { label: string; short: string }> = {
  imo_dcs: { label: "IMO DCS", short: "DCS" },
  eu_mrv: { label: "EU MRV", short: "MRV" },
  fueleu: { label: "FuelEU", short: "FuelEU" },
  seemp1: { label: "SEEMP Part I", short: "SEEMP I" },
  seemp2: { label: "SEEMP Part II", short: "SEEMP II" },
  seemp3: { label: "SEEMP Part III / CII", short: "SEEMP III" },
  uk_ets: { label: "UK ETS", short: "UK ETS" },
}

// Roles themselves (label, categories, capabilities) live in the roles table and are edited in Administration.
export const CAPABILITIES: Record<Capability, { label: string; hint: string }> = {
  "mail.all": { label: "Read all mailbox emails", hint: "Without it: the role's categories, plus mail assigned to them or to whoever they back up" },
  "thread.assign": { label: "Assign emails to others", hint: "Anyone can take an email themselves" },
  "commercial.confirm": { label: "Confirm transactions & allocations", hint: "Commercial records" },
  admin: { label: "Administration", hint: "Users, roles, rules, shared templates, escalation policy, audit log" },
}
