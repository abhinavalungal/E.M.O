/** A roles.id; roles and what they can see are configured by admins (Administration → Users & roles). */
export type Role = string

/** What a role may do beyond reading its categories. Enforced in the app and in every server action. */
export type Capability = "admin" | "mail.all" | "thread.assign" | "commercial.confirm"

export type RoleConfig = { id: Role; label: string; categories: Category[]; capabilities: Capability[] }

export type Availability = "available" | "on_leave" | "unavailable"

/** An inbox search saved by a user: `query` is the inbox URL's query string. */
export type SavedView = { name: string; query: string }

export type User = {
  id: string
  name: string
  email: string
  role: Role
  initials: string
  lead?: boolean
  active?: boolean // false = removed by an admin; kept so history still shows their name
  backupId?: string // who covers their mail while they are away
  availability?: Availability
  awayFrom?: string // YYYY-MM-DD, IST, inclusive; empty = from now
  awayUntil?: string // YYYY-MM-DD, IST, inclusive; empty = until they switch back
  signature?: string
  prefs?: Record<string, Record<string, boolean>>
  views?: SavedView[]
}

/** Admin policy for mail nobody has answered (settings row 'escalation'). */
export type EscalationPolicy = { hours: number; reassign: boolean }

export type Group = "reports" | "commercial" | "regulatory" | "queries" | "other"

export type Category =
  | "vessel_report"
  | "bdn"
  | "allocation"
  | "allocation_confirmation"
  | "customer_query"
  | "invoice"
  | "carbon_trading"
  | "imo_dcs"
  | "eu_mrv"
  | "fueleu"
  | "seemp"
  | "eu_ets"
  | "uk_ets"
  | "other"

export type Status = "new" | "open" | "waiting_customer" | "waiting_internal" | "resolved"
export type Priority = "urgent" | "high" | "medium" | "low"

export type Org = {
  id: string
  name: string
  short: string
  domain: string
  country: string
  kind: "customer" | "verifier" | "broker" | "supplier" | "internal" | "publisher"
  ownerId?: string
}

// Vessels first seen in a mailbox report have only name, IMO, code and principal until someone adds the rest.
export type Vessel = {
  imo: string
  name: string
  code?: string // vessel code from report forms, e.g. NAMO
  principal?: string
  type?: "Bulk carrier" | "Oil tanker" | "Container ship" | "Reefer" | "Chemical tanker"
  flag?: string
  dwt?: number
  built?: number
  customerId?: string
  cii2025?: "A" | "B" | "C" | "D" | "E"
  voyage?: { no: string; from?: string; to?: string; eta?: string }
  location?: string
  condition?: string
  lastReportAt?: string
  lastReportId?: string
  ukEts?: boolean
}

export type Attachment = {
  id?: string // Graph attachment id (mail synced before 2026-10-15 has none)
  name: string
  size: string
  kind: string // file extension: pdf, xlsx, docx, csv, zip…
  scanned?: boolean
  duplicateOf?: string
}

export type Message = {
  id: string
  direction: "in" | "out"
  from: { name: string; email: string }
  to: string[]
  cc?: string[]
  at: string
  body: string
  attachments?: Attachment[]
  sentBy?: string
}

export type Label = { category: Category; confidence: number; source: "rule" | "ai" | "human"; ruleId?: string }

export type Intel = {
  summary: string
  request?: string // request/action/extracted come from AI analysis; live mail has none yet
  action?: string
  deadline?: string
  missing?: string[]
  extracted: { label: string; value: string }[]
  suggestedReply?: string
  proposal?: { kind: "compliance" | "transaction" | "allocation" | "invoice"; text: string }
}

export type Note = { id: string; authorId: string; at: string; body: string }

export type Thread = {
  id: string
  subject: string
  orgId: string
  customerId?: string
  vesselImos: string[]
  voyage?: string
  labels: Label[]
  status: Status
  priority: Priority
  important?: boolean
  unread?: boolean
  needsReview?: boolean
  duplicateOf?: string
  assigneeId?: string
  originalAssigneeId?: string // first PIC, kept when automation moves the thread to a backup
  escalatedAt?: string // set when automation reassigned it; it is never moved twice
  slaDueAt?: string
  snoozedUntil?: string
  viewers?: string[]
  messages: Message[]
  intel: Intel
  notes: Note[]
}

export type Regulation = "imo_dcs" | "eu_mrv" | "fueleu" | "seemp1" | "seemp2" | "seemp3" | "uk_ets"
export type ComplianceStatus =
  | "complete"
  | "submitted"
  | "in_progress"
  | "review"
  | "action_required"
  | "overdue"
  | "na"

export type ComplianceItem = {
  imo: string
  regulation: Regulation
  period: number
  status: ComplianceStatus
  due?: string
  note?: string
  threadId?: string
}

export type CompanyObligation = {
  customerId: string
  period: number
  euEts: { verifiedT: number; required: number; surrendered: number; status: ComplianceStatus }
  fuelEu: { balanceT: number; pool?: string; doc: ComplianceStatus }
  ukEts?: { status: ComplianceStatus; note: string }
}

/** One reading as the vessel wrote it; `value` is set only when `raw` is a plain number. */
export type Reading = { label: string; raw: string; value?: number; unit?: string; section: string; group?: string }

export type Report = {
  id: string
  imo: string
  type: "Noon report" | "Voyage report" | "Arrival report" | "Departure report" | "Bunker report" | "Monthly fuel report" | "BDN"
  label: string
  at: string
  status: "received" | "missing" | "duplicate" | "revised"
  threadId?: string
  messageId?: string
  source?: string // "body" or the attachment name
  voyageNo?: string
  /** Written by outlook-pipeline.py (vessel_reports.py); nested keys stay snake_case. */
  data?: {
    form?: string
    at_source?: string
    at_raw?: string
    tz_assumed?: boolean
    voyage: Record<string, string | number>
    bunkers: { fuel: string; "ROB End"?: number; "BDN Quantity"?: number; unit: string }[]
    readings: Reading[]
  }
}

export type CarbonTxn = {
  id: string
  date: string
  type: "buy" | "sell" | "transfer_in" | "transfer_out" | "surrender"
  instrument: "EUA" | "UKA"
  qty: number
  price?: number
  currency: "EUR" | "GBP"
  counterparty: string
  customerId?: string
  imo?: string
  status: "proposed" | "confirmed" | "settled"
  source: "email" | "excel" | "platform"
  threadId?: string
}

export type Allocation = {
  id: string
  customerId: string
  imo?: string
  period: string
  qty: number
  instrument: "EUA" | "UKA"
  requestedAt: string
  confirmedAt?: string
  status: "requested" | "pending_confirmation" | "confirmed"
  threadId?: string
}

export type Invoice = {
  id: string
  kind: "service" | "carbon_transfer"
  customerId: string
  imo?: string
  description: string
  amount: number
  currency: "EUR" | "USD" | "GBP" | "INR"
  issued: string
  due: string
  status: "draft" | "pending" | "sent" | "paid" | "overdue" | "disputed"
  txnId?: string
  threadId?: string
}

export type Alert = {
  id: string
  type:
    | "sla"
    | "missing_bdn"
    | "missing_report"
    | "deadline"
    | "invoice_overdue"
    | "allocation_missing"
    | "needs_review"
    | "duplicate"
    | "assigned"
    | "regulatory"
    | "transaction"
    | "cover"
    | "unanswered"
    | "sync"
  severity: "critical" | "high" | "medium" | "low"
  title: string
  detail: string
  at: string
  href: string
  status: "open" | "snoozed" | "resolved"
  ownerId?: string
  roles: Role[]
}

export type Rule = {
  id: string
  name: string
  pattern: string // case-insensitive regex tested on subject + attachment names
  category: Category
  confidence: number
  enabled: boolean
  position: number
}

export type Deadline = { id: string; date: string; title: string; scope: string; href: string; severity: "critical" | "high" | "medium" | "low" }

/** ownerId set = a personal template; unset = shared, with `roles` limiting who sees it (empty = everyone). */
export type Template = { id: string; name: string; category: Category; body: string; ownerId?: string; roles?: Role[] }

export type Activity = { id: string; at: string; actorId: string; action: string; target: string; href?: string }
