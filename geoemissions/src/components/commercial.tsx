"use client"

import Link from "next/link"
import { toast } from "sonner"
import { Check, FileSpreadsheet, Info, Mail, MonitorSmartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { daysUntil, fmtAgo, fmtDate, fmtMoney, fmtNum } from "@/lib/format"
import { positions } from "@/lib/metrics"
import { inboxHref } from "@/lib/query"
import { useStore } from "@/lib/store"
import type { Allocation, CarbonTxn, Invoice } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, PageHeader, SectionCard, StatTile } from "./page"
import { Pill, type Tone } from "./pills"
import { UrlTabs } from "./url-tabs"
import { PositionsChart } from "./charts"

const d = (date: string) => fmtDate(date + "T06:30:00Z")

function Instrument({ i }: { i: "EUA" | "UKA" }) {
  return <Pill tone={i === "EUA" ? "brand" : "info"}>{i}</Pill>
}

function EmailLink({ threadId }: { threadId?: string }) {
  if (!threadId) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <Link href={inboxHref({ view: "all", t: threadId })} className="inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
      <Mail className="size-3" /> Email
    </Link>
  )
}

function Head({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TableHead className={cn("text-xs", className)}>{children}</TableHead>
}

// ─── Allocations ────────────────────────────────────────────────────────────

const ALLOC_STATUS: Record<Allocation["status"], { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "info" },
  pending_confirmation: { label: "Awaiting confirmation", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "ok" },
}

export function AllocationTable({ rows }: { rows: Allocation[] }) {
  const { orgById, vesselByImo, confirmAllocation, loadedAt } = useStore()
  if (!rows.length) return <EmptyState icon={Info} title="No allocations" />
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <Head className="pl-4">Reference</Head>
          <Head>Customer · vessel</Head>
          <Head>Period</Head>
          <Head className="text-right">Quantity</Head>
          <Head>Requested</Head>
          <Head>Status</Head>
          <Head className="pr-4 text-right">Source</Head>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => {
          const status = a.status
          const age = (loadedAt - Date.parse(a.requestedAt)) / 86_400_000
          return (
            <TableRow key={a.id}>
              <TableCell className="pl-4 font-mono text-xs">{a.id}</TableCell>
              <TableCell className="text-[13px]">
                {orgById(a.customerId)?.short}
                {a.imo && <span className="text-muted-foreground"> · {vesselByImo(a.imo)?.name}</span>}
              </TableCell>
              <TableCell className="text-[13px] text-muted-foreground">{a.period}</TableCell>
              <TableCell className="text-right text-[13px] tabular">
                {fmtNum(a.qty)} <Instrument i={a.instrument} />
              </TableCell>
              <TableCell className={cn("text-[13px]", status !== "confirmed" && age > 7 ? "font-medium text-bad" : "text-muted-foreground")}>
                {fmtAgo(a.requestedAt)}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <Pill tone={ALLOC_STATUS[status].tone}>{ALLOC_STATUS[status].label}</Pill>
                  {status === "pending_confirmation" && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        confirmAllocation(a.id)
                        toast.success(`${a.id} confirmed`, { description: "Saved · recorded in the audit log." })
                      }}
                    >
                      <Check /> Mark confirmed
                    </Button>
                  )}
                </span>
              </TableCell>
              <TableCell className="pr-4 text-right">
                <EmailLink threadId={a.threadId} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Carbon transactions ────────────────────────────────────────────────────

const TXN_TYPE: Record<CarbonTxn["type"], string> = {
  buy: "Buy",
  sell: "Sell",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  surrender: "Surrender",
}
const TXN_STATUS: Record<CarbonTxn["status"], { label: string; tone: Tone }> = {
  proposed: { label: "Proposed", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "info" },
  settled: { label: "Settled", tone: "ok" },
}
const SOURCE = { email: { icon: Mail, label: "Email" }, excel: { icon: FileSpreadsheet, label: "Excel" }, platform: { icon: MonitorSmartphone, label: "Platform" } }

export function TxnTable({ rows }: { rows: CarbonTxn[] }) {
  const { updateTxn } = useStore()
  if (!rows.length) return <EmptyState icon={Info} title="No transactions" />
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <Head className="pl-4">Reference</Head>
          <Head>Date</Head>
          <Head>Type</Head>
          <Head className="text-right">Quantity</Head>
          <Head className="text-right">Price</Head>
          <Head className="text-right">Value</Head>
          <Head>Counterparty</Head>
          <Head>Source</Head>
          <Head className="pr-4">Status</Head>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((x) => {
          const S = SOURCE[x.source]
          return (
            <TableRow key={x.id} className={x.status === "proposed" ? "bg-warn-soft/40" : undefined}>
              <TableCell className="pl-4 font-mono text-xs">{x.id}</TableCell>
              <TableCell className="text-[13px] whitespace-nowrap text-muted-foreground">{d(x.date)}</TableCell>
              <TableCell className="text-[13px]">{TXN_TYPE[x.type]}</TableCell>
              <TableCell className="text-right text-[13px] whitespace-nowrap tabular">
                {fmtNum(x.qty)} <Instrument i={x.instrument} />
              </TableCell>
              <TableCell className="text-right text-[13px] tabular">{x.price ? fmtMoney(x.price, x.currency) : "—"}</TableCell>
              <TableCell className="text-right text-[13px] tabular">{x.price ? fmtMoney(x.price * x.qty, x.currency, true) : "—"}</TableCell>
              <TableCell className="max-w-[200px] truncate text-[13px]">{x.counterparty}</TableCell>
              <TableCell>
                {x.threadId ? (
                  <Link href={inboxHref({ view: "all", t: x.threadId })} className="inline-flex items-center gap-1 text-xs text-sky hover:underline">
                    <S.icon className="size-3" /> {S.label}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <S.icon className="size-3" /> {S.label}
                  </span>
                )}
              </TableCell>
              <TableCell className="pr-4">
                <span className="flex items-center gap-2">
                  <Pill tone={TXN_STATUS[x.status].tone}>{TXN_STATUS[x.status].label}</Pill>
                  {x.status === "proposed" && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="bg-card"
                      onClick={() => {
                        updateTxn(x.id, { status: "confirmed" })
                        toast.success(`${x.id} confirmed`, { description: "Saved · recorded in the audit log." })
                      }}
                    >
                      <Check /> Confirm
                    </Button>
                  )}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Invoices ───────────────────────────────────────────────────────────────

const INV_STATUS: Record<Invoice["status"], { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending: { label: "Payment advised", tone: "info" },
  sent: { label: "Sent", tone: "brand" },
  paid: { label: "Paid", tone: "ok" },
  overdue: { label: "Overdue", tone: "bad" },
  disputed: { label: "Disputed", tone: "warn" },
}

export function InvoiceTable({ rows, highlight }: { rows: Invoice[]; highlight?: string }) {
  const { orgById } = useStore()
  if (!rows.length) return <EmptyState icon={Info} title="No invoices" />
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <Head className="pl-4">Invoice</Head>
          <Head>Type</Head>
          <Head>Customer</Head>
          <Head>Description</Head>
          <Head className="text-right">Amount</Head>
          <Head>Due</Head>
          <Head>Status</Head>
          <Head className="pr-4 text-right">Links</Head>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((i) => {
          const days = daysUntil(i.due)
          const open = i.status !== "paid" && i.status !== "draft"
          return (
            <TableRow key={i.id} className={highlight === i.id ? "bg-sky-soft" : undefined}>
              <TableCell className="pl-4 font-mono text-xs">{i.id}</TableCell>
              <TableCell className="text-[13px] whitespace-nowrap text-muted-foreground">{i.kind === "carbon_transfer" ? "Carbon transfer" : "Service"}</TableCell>
              <TableCell className="text-[13px] whitespace-nowrap">
                <Link href={`/customers/${i.customerId}`} className="hover:underline">
                  {orgById(i.customerId)?.short}
                </Link>
              </TableCell>
              <TableCell className="max-w-[260px] truncate text-[13px] text-muted-foreground">{i.description}</TableCell>
              <TableCell className="text-right text-[13px] font-medium whitespace-nowrap tabular">{fmtMoney(i.amount, i.currency)}</TableCell>
              <TableCell className={cn("text-[13px] whitespace-nowrap", open && days < 0 ? "font-medium text-bad" : "text-muted-foreground")}>
                {d(i.due)}
                {open && days < 0 && <span className="block text-[11px]">{-days}d overdue</span>}
              </TableCell>
              <TableCell>
                <Pill tone={INV_STATUS[i.status].tone}>{INV_STATUS[i.status].label}</Pill>
              </TableCell>
              <TableCell className="pr-4 text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-3">
                  {i.txnId && <span className="font-mono text-[11px] text-muted-foreground">{i.txnId}</span>}
                  <EmailLink threadId={i.threadId} />
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function CommercialPage({ tab, kind, q }: { tab: string; kind: string; q?: string }) {
  const { txns, allocations, invoices: allInvoices, loadedAt } = useStore()
  const pendingAlloc = allocations.filter((a) => a.status !== "confirmed")
  const awaiting = allocations.filter((a) => a.status === "pending_confirmation")
  const stale = awaiting.filter((a) => loadedAt - Date.parse(a.requestedAt) > 7 * 86_400_000).length
  const confirmed = allocations.filter((a) => a.status === "confirmed")
  const eurOutstanding = allInvoices.filter((i) => ["sent", "pending", "overdue", "disputed"].includes(i.status) && i.currency === "EUR").reduce((s, i) => s + i.amount, 0)
  const overdue = allInvoices.filter((i) => i.status !== "paid" && i.status !== "draft" && (i.status === "overdue" || daysUntil(i.due) < 0))
  const disputed = allInvoices.filter((i) => i.status === "disputed")
  const invoices = allInvoices.filter((i) => kind === "all" || i.kind === kind)
  const pos = positions(txns)
  const available = pos.eua.balance - pos.eua.committed

  return (
    <>
      <PageHeader title="Commercial" description="Allocations, carbon transactions, positions and invoices — each linked back to its source email.">
        <UrlTabs
          base="/commercial"
          current={tab}
          tabs={[
            { value: "allocations", label: "Allocations", count: pendingAlloc.length },
            { value: "carbon", label: "Carbon transactions", count: txns.filter((x) => x.status === "proposed").length },
            { value: "positions", label: "Positions" },
            { value: "invoices", label: "Invoices", count: overdue.length },
          ]}
        />
      </PageHeader>

      <div className="space-y-4 px-4 py-5 md:px-6">
        {tab === "allocations" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="New requests" value={allocations.filter((a) => a.status === "requested").length} sub="Not yet actioned" />
              <StatTile label="Awaiting confirmation" value={awaiting.length} sub={stale ? `${stale} older than 7 days` : "None older than 7 days"} tone={stale ? "warn" : undefined} />
              <StatTile label="Confirmed" value={confirmed.length} sub={`${fmtNum(confirmed.filter((a) => a.instrument === "EUA").reduce((s, a) => s + a.qty, 0))} EUA`} />
              <StatTile label="Pending quantity" value={fmtNum(pendingAlloc.filter((a) => a.instrument === "EUA").reduce((s, a) => s + a.qty, 0))} sub="EUA across open allocations" />
            </div>
            <SectionCard title="Allocations">
              <AllocationTable rows={allocations} />
            </SectionCard>
          </>
        )}

        {tab === "carbon" && (
          <>
            <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn-soft/60 px-4 py-3 text-[13px]">
              <Info className="mt-0.5 size-4 shrink-0 text-warn" />
              <p className="text-foreground/80">
                <span className="font-medium text-foreground">Proposed</span> rows don&apos;t affect positions until someone confirms them.
              </p>
            </div>
            <SectionCard title="Carbon transactions" action={<span className="text-xs text-muted-foreground">EUA & UKA · all sources</span>}>
              <TxnTable rows={txns} />
            </SectionCard>
          </>
        )}

        {tab === "positions" && (
          <>
            <div className="flex items-start gap-2.5 rounded-lg border bg-card px-4 py-3 text-[13px]">
              <Info className="mt-0.5 size-4 shrink-0 text-info" />
              <p className="text-foreground/80">
                <span className="font-medium text-foreground">Indicative position</span> computed from confirmed and settled transactions. Not a
                registry balance: record the opening holding as a &ldquo;transfer in&rdquo; so the totals start from the right number.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="EUA position" value={fmtNum(pos.eua.balance)} sub="Confirmed + settled" />
              <StatTile label="EUA committed" value={fmtNum(pos.eua.committed)} sub="Proposed outflows not yet confirmed" tone={pos.eua.committed ? "warn" : undefined} />
              <StatTile label="EUA available" value={fmtNum(available)} sub="Position − committed" />
              <StatTile label="UKA position" value={fmtNum(pos.uka.balance)} sub="Confirmed + settled" />
            </div>
            <SectionCard title="EUA movement by month" action={<span className="text-xs text-muted-foreground">Last 6 months</span>} bodyClassName="px-3 pt-3 pb-2">
              <PositionsChart data={pos.monthly} />
            </SectionCard>
          </>
        )}

        {tab === "invoices" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Outstanding (EUR)" value={fmtMoney(eurOutstanding, "EUR", true)} sub="Sent, advised, overdue or disputed" />
              <StatTile label="Overdue" value={overdue.length} sub={overdue.map((i) => i.id).join(", ") || "None"} tone={overdue.length ? "bad" : undefined} />
              <StatTile label="Disputed" value={disputed.length} sub={disputed.map((i) => i.id).join(", ") || "None"} tone={disputed.length ? "warn" : undefined} />
              <StatTile label="Paid" value={allInvoices.filter((i) => i.status === "paid").length} sub="Invoices marked paid" />
            </div>
            <div className="flex gap-1.5">
              {[
                ["all", "All"],
                ["service", "Customer invoices"],
                ["carbon_transfer", "Carbon transfer invoices"],
              ].map(([k, label]) => (
                <Link
                  key={k}
                  href={`/commercial?tab=invoices&kind=${k}`}
                  scroll={false}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
                    kind === k ? "border-brand bg-brand text-white" : "bg-card text-foreground/75 hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <SectionCard title="Invoices">
              <InvoiceTable rows={invoices} highlight={q} />
            </SectionCard>
          </>
        )}
      </div>
    </>
  )
}
