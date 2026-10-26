// Loads everything the app shows from Supabase in one round of parallel requests, on every page request.
import "server-only"
import { connection } from "next/server"
import { select } from "./db"
import { toThreads, type GraphMessage, type ThreadState } from "./mail"
import { canSee, viewer } from "./team"
import type { AlertState } from "./alerts"
import type {
  Activity,
  Allocation,
  CarbonTxn,
  CompanyObligation,
  ComplianceItem,
  ComplianceStatus,
  Deadline,
  EscalationPolicy,
  Invoice,
  Note,
  Org,
  Report,
  RoleConfig,
  Rule,
  Template,
  Thread,
  User,
  Vessel,
} from "./types"

export type Workspace = {
  users: User[] // including removed ones (active: false), so history keeps their names
  roles: RoleConfig[]
  policy: EscalationPolicy
  orgs: Org[]
  vessels: Vessel[]
  reports: Report[]
  compliance: ComplianceItem[]
  obligations: CompanyObligation[]
  deadlines: Deadline[]
  txns: CarbonTxn[]
  allocations: Allocation[]
  invoices: Invoice[]
  rules: Rule[]
  templates: Template[]
  activity: Activity[]
  threads: Thread[]
  alertStates: AlertState[]
  sync: { syncedAt?: string; error?: string }
  reportSync: { syncedAt?: string; error?: string } // vessel report extraction (outlook-pipeline.py)
  loadedAt: number // server time of this load: the render-safe "now" for age checks
  error?: string // the database itself could not be read
}

// Flat columns in Postgres (easy to edit in the Supabase table editor), nested objects in the app.
type VesselRow = Omit<Vessel, "voyage"> & { voyageNo?: string; voyageFrom?: string; voyageTo?: string; voyageEta?: string }
type ObligationRow = {
  customerId: string
  period: number
  euEtsVerifiedT: number
  euEtsRequired: number
  euEtsSurrendered: number
  euEtsStatus: ComplianceStatus
  fuelEuBalanceT: number
  fuelEuPool?: string
  fuelEuDoc: ComplianceStatus
  ukEtsStatus?: ComplianceStatus
  ukEtsNote?: string
}

// The Graph message fields the inbox list needs, read out of messages.data (PostgREST JSON paths).
const LIST_FIELDS = [
  "id",
  "conversationId:conversation_id",
  "folder",
  ...["receivedDateTime", "subject", "from", "toRecipients", "ccRecipients", "isRead", "importance", "flag", "bodyPreview", "attachments"].map((k) => `${k}:data->${k}`),
].join(",")

const POLICY: EscalationPolicy = { hours: 24, reassign: false }

const EMPTY: Workspace = {
  users: [],
  roles: [],
  policy: POLICY,
  orgs: [],
  vessels: [],
  reports: [],
  compliance: [],
  obligations: [],
  deadlines: [],
  txns: [],
  allocations: [],
  invoices: [],
  rules: [],
  templates: [],
  activity: [],
  threads: [],
  alertStates: [],
  sync: {},
  reportSync: {},
  loadedAt: 0,
}

export async function loadWorkspace(): Promise<Workspace> {
  await connection() // per request, never at build time
  try {
    const [users, roles, settings, orgs, vesselRows, reports, compliance, obligationRows, deadlines, txns, allocations, invoices, rules, templates, activity, messages, states, notes, alertStates, sync] =
      await Promise.all([
        select<User>("users", "order=name.asc"),
        select<RoleConfig>("roles", "order=label.asc"),
        select<{ id: string; value: unknown }>("settings"),
        select<Org>("orgs", "order=name.asc"),
        select<VesselRow>("vessels", "order=name.asc"),
        select<Report>("reports", "order=at.desc"),
        select<ComplianceItem>("compliance_items"),
        select<ObligationRow>("company_obligations", "order=period.desc"),
        select<Deadline>("deadlines", "order=date.asc"),
        select<CarbonTxn>("carbon_txns", "order=date.desc"),
        select<Allocation>("allocations", "order=requested_at.desc"),
        select<Invoice>("invoices", "order=issued.desc"),
        select<Rule>("rules", "order=position.asc"),
        select<Template>("templates", "order=name.asc"),
        select<Activity>("activity", "order=at.desc&limit=200"),
        // Everything but the body (~5x smaller); an opened email's body comes from Graph (/api/mail/[id]).
        // ponytail: still the newest 1,000 messages on every request; page the list if the mailbox outgrows that.
        select<GraphMessage>("messages", `select=${LIST_FIELDS}&order=received_at.desc&limit=1000`),
        select<ThreadState>("thread_state"),
        select<Note & { threadId: string }>("notes", "order=at.asc"),
        select<AlertState>("alert_state"),
        select<{ id: string; syncedAt?: string; error?: string }>("sync_status"),
      ])
    const vessels = vesselRows.map(({ voyageNo, voyageFrom, voyageTo, voyageEta, ...v }): Vessel => ({
      ...v,
      voyage: voyageNo ? { no: voyageNo, from: voyageFrom, to: voyageTo, eta: voyageEta } : undefined,
    }))
    const obligations = obligationRows.map((o): CompanyObligation => ({
      customerId: o.customerId,
      period: o.period,
      euEts: { verifiedT: o.euEtsVerifiedT, required: o.euEtsRequired, surrendered: o.euEtsSurrendered, status: o.euEtsStatus },
      fuelEu: { balanceT: o.fuelEuBalanceT, pool: o.fuelEuPool, doc: o.fuelEuDoc },
      ukEts: o.ukEtsStatus ? { status: o.ukEtsStatus, note: o.ukEtsNote ?? "" } : undefined,
    }))
    const threads = toThreads(messages, { orgs, vessels, rules, states, notes, reports })
    const policy = { ...POLICY, ...(settings.find((s) => s.id === "escalation")?.value as Partial<EscalationPolicy>) }
    return { users, roles, policy, orgs, vessels, reports, compliance, obligations, deadlines, txns, allocations, invoices, rules, templates, activity, threads, alertStates, sync: sync.find((s) => s.id === "mail") ?? {}, reportSync: sync.find((s) => s.id === "reports") ?? {}, loadedAt: Date.now() }
  } catch (e) {
    return { ...EMPTY, loadedAt: Date.now(), error: e instanceof Error ? e.message : String(e) }
  }
}

/** The workspace as one user may see it: mail outside their role never leaves the server. */
export function forViewer(ws: Workspace, uid?: string): Workspace {
  const me = viewer(ws.users, ws.roles, uid)
  if (!me) return ws
  const role = ws.roles.find((r) => r.id === me.role)
  // ponytail: the audit log and alerts' inputs other than threads aren't filtered by role; do it with real sign-in.
  return { ...ws, threads: ws.threads.filter((t) => canSee(t, me, role, ws.users)) }
}
