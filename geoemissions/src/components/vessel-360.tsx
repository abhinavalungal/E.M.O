"use client"

import Link from "next/link"
import { Fragment, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Inbox, MapPin, Ship } from "lucide-react"
import { REGULATIONS } from "@/lib/data"
import { fmtAgo, fmtDate, fmtDateTime } from "@/lib/format"
import { inboxHref } from "@/lib/query"
import { useStore } from "@/lib/store"
import { buildTimeline } from "@/lib/timeline"
import type { Regulation, Report } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CardLink, EmptyState, SectionCard } from "./page"
import { CategoryChip, ComplianceBadge, Imo, Pill, StatusPill, UserAvatar } from "./pills"
import { Fact, Timeline } from "./entity"
import { CiiScale } from "./cii"
import { UrlTabs } from "./url-tabs"
import { AllocationTable, InvoiceTable, TxnTable } from "./commercial"

const REPORT_TONE = { received: "ok", missing: "bad", duplicate: "neutral", revised: "info" } as const

export function Vessel360({ imo, tab }: { imo: string; tab: string }) {
  const store = useStore()
  const [openReport, setOpenReport] = useState<string>()
  const { threads, txns, vesselByImo, orgById } = store
  const v = vesselByImo(imo)
  if (!v) return <EmptyState icon={Ship} title="Vessel not found" />
  const customer = orgById(v.customerId)
  const year = new Date().getFullYear()
  const vThreads = threads.filter((t) => t.vesselImos.includes(imo)).sort((a, b) => b.messages.at(-1)!.at.localeCompare(a.messages.at(-1)!.at))
  const open = vThreads.filter((t) => t.status !== "resolved")
  const reports = store.reports.filter((r) => r.imo === imo).sort((a, b) => b.at.localeCompare(a.at))
  const missing = reports.filter((r) => r.status === "missing")
  const comp = store.compliance.filter((c) => c.imo === imo)
  const events = buildTimeline({ ...store, imos: [imo] })
  const ofCustomer = (c?: string) => !!v.customerId && c === v.customerId
  const vTxns = txns.filter((x) => x.imo === imo || (ofCustomer(x.customerId) && !x.imo))
  const latest = reports.find((r) => r.id === v.lastReportId) ?? reports.find((r) => r.status === "received")
  const regs = Object.keys(REGULATIONS) as Regulation[]
  const base = `/vessels/${imo}`

  return (
    <div>
      <div className="border-b bg-card px-4 pt-4 md:px-6">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/vessels" className="hover:text-foreground">
            Vessels
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{v.name}</span>
        </nav>
        <div className="mt-2.5 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{v.name}</h1>
              {v.type && <Pill tone="neutral">{v.type}</Pill>}
              {v.condition && <Pill tone="info">{v.condition}</Pill>}
              {missing.length > 0 && (
                <Pill tone="bad" icon={AlertTriangle}>
                  {missing.length} missing report{missing.length > 1 ? "s" : ""}
                </Pill>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <Imo imo={v.imo} className="text-[13px]" />
              {v.code && (
                <span>
                  Code <span className="font-mono text-foreground">{v.code}</span>
                </span>
              )}
              {v.principal && <span>Principal {v.principal}</span>}
              {customer && (
                <span>
                  Customer{" "}
                  <Link href={`/customers/${customer.id}`} className="font-medium text-foreground hover:underline">
                    {customer.name}
                  </Link>
                </span>
              )}
              {v.flag && <span>Flag {v.flag}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={inboxHref({ view: "all", vessel: imo })}>
                <Inbox /> All emails
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-stretch gap-4">
        <dl className="grid flex-1 grid-cols-2 gap-4 rounded-lg border bg-background/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Current voyage">
            <span className="font-mono text-xs">{v.voyage?.no ?? "—"}</span>
          </Fact>
          <Fact label="Location">{v.location ?? "—"}</Fact>
          <Fact label="Route">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3 text-muted-foreground" />
              {v.voyage?.from ?? "—"} → {v.voyage?.to ?? "—"}
            </span>
          </Fact>
          <Fact label="ETA">{v.voyage?.eta ? fmtDate(v.voyage.eta + "T06:30:00Z") : "—"}</Fact>
          <Fact label="Last report">
            {v.lastReportAt ? (
              <span title={fmtDateTime(v.lastReportAt)}>
                {fmtDate(v.lastReportAt)} · {fmtAgo(v.lastReportAt)}
              </span>
            ) : (
              "—"
            )}
          </Fact>
          <Fact label="DWT · Built">
            {v.dwt ? `${v.dwt.toLocaleString()} t` : "—"} · {v.built ?? "—"}
          </Fact>
        </dl>
        <div className="flex items-center rounded-lg border bg-background/60 px-4 py-3">
          <CiiScale rating={v.cii2025} />
        </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">{year} compliance</span>
          {regs.map((r) => {
            const c = comp.find((x) => x.regulation === r && x.period === year)
            return (
              <span key={r} className="inline-flex items-center gap-1 rounded-md border bg-card py-0.5 pr-0.5 pl-2 text-[11px]">
                <span className="font-medium text-foreground/80">{REGULATIONS[r].short}</span>
                {c ? <ComplianceBadge status={c.status} short /> : <span className="px-1.5 text-muted-foreground">—</span>}
              </span>
            )
          })}
        </div>

        <div className="mt-5">
          <UrlTabs
            base={base}
            current={tab}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "emails", label: "Emails", count: vThreads.length },
              { value: "reports", label: "Reports", count: reports.length },
              { value: "commercial", label: "Commercial" },
              { value: "compliance", label: "Compliance" },
              { value: "timeline", label: "Timeline" },
            ]}
          />
        </div>
      </div>

      <div className="px-4 py-5 md:px-6">
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard className="lg:col-span-2" title="Recent activity" action={<CardLink href={`${base}?tab=timeline`}>Full timeline</CardLink>} bodyClassName="p-3">
              <Timeline events={events} limit={8} />
            </SectionCard>
            <div className="space-y-4">
              {latest?.data && (
                <SectionCard
                  title={`Latest report · ${latest.type}`}
                  action={latest.threadId && <CardLink href={inboxHref({ view: "all", t: latest.threadId })}>Source email</CardLink>}
                  bodyClassName="p-4"
                >
                  <ReportSummary r={latest} />
                </SectionCard>
              )}
              <SectionCard title={`Open items (${open.length})`} bodyClassName="divide-y">
                {open.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">Nothing open for this vessel.</p>
                ) : (
                  open.map((t) => (
                    <Link key={t.id} href={inboxHref({ view: "all", t: t.id })} className="block px-4 py-2.5 hover:bg-muted/50">
                      <span className="line-clamp-1 text-[13px] font-medium text-foreground">{t.subject}</span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <CategoryChip category={t.labels[0].category} />
                        <StatusPill status={t.status} />
                        <UserAvatar userId={t.assigneeId} size="xs" className="ml-auto" />
                      </span>
                    </Link>
                  ))
                )}
              </SectionCard>
              <SectionCard title="Expected reports" bodyClassName="divide-y">
                {missing.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">All expected reports received.</p>
                ) : (
                  missing.map((r) => (
                    <div key={r.id} className="flex items-start gap-2.5 px-4 py-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
                      <span>
                        <span className="block text-[13px] font-medium text-foreground">{r.type} missing</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.label} · flagged {fmtAgo(r.at)}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </SectionCard>
            </div>
          </div>
        )}

        {tab === "emails" && (
          <div className="overflow-hidden rounded-lg border bg-card">
            {vThreads.length === 0 ? (
              <EmptyState icon={Inbox} title="No emails linked yet" />
            ) : (
              <ul className="divide-y">
                {vThreads.map((t) => (
                  <li key={t.id}>
                    <Link href={inboxHref({ view: "all", t: t.id })} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">{t.subject}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.intel.summary}</span>
                      </span>
                      <CategoryChip category={t.labels[0].category} />
                      <StatusPill status={t.status} />
                      <span className="w-16 text-right text-[11px] text-muted-foreground">{fmtAgo(t.messages.at(-1)!.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "reports" && (
          <div className="overflow-hidden rounded-lg border bg-card">
            {reports.length === 0 ? (
              <EmptyState icon={FileText} title="No reports recorded" hint="Vessel reports for this IMO found in the mailbox appear here." />
            ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Report</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <Fragment key={r.id}>
                  <TableRow className={cn(r.data && "cursor-pointer")} onClick={() => r.data && setOpenReport(openReport === r.id ? undefined : r.id)}>
                    <TableCell className="pl-4 text-[13px] font-medium">
                      {r.data ? (
                        <button className="inline-flex items-center gap-1 outline-none focus-visible:underline" aria-expanded={openReport === r.id}>
                          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", openReport !== r.id && "-rotate-90")} />
                          {r.type}
                        </button>
                      ) : (
                        r.type
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{r.label}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground" title={fmtDateTime(r.at)}>
                      {fmtDate(r.at)} · {fmtAgo(r.at)}
                    </TableCell>
                    <TableCell>
                      <Pill tone={REPORT_TONE[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {r.threadId ? <CardLink href={inboxHref({ view: "all", t: r.threadId })}>Open email</CardLink> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                  {openReport === r.id && r.data && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-muted/20 px-4 py-4 whitespace-normal">
                        <ReportSummary r={r} />
                        <ReportReadings r={r} />
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            )}
          </div>
        )}

        {tab === "commercial" && (
          <div className="space-y-4">
            <SectionCard title="Allocations">
              <AllocationTable rows={store.allocations.filter((a) => a.imo === imo || (ofCustomer(a.customerId) && !a.imo))} />
            </SectionCard>
            <SectionCard title="Carbon transactions">
              <TxnTable rows={vTxns} />
            </SectionCard>
            <SectionCard title="Invoices">
              <InvoiceTable rows={store.invoices.filter((i) => i.imo === imo || ofCustomer(i.customerId))} />
            </SectionCard>
          </div>
        )}

        {tab === "compliance" && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Regulation</TableHead>
                  <TableHead>{year - 1}</TableHead>
                  <TableHead>{year}</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="pr-4 text-right">Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regs.map((r) => {
                  const prev = comp.find((x) => x.regulation === r && x.period === year - 1)
                  const cur = comp.find((x) => x.regulation === r && x.period === year)
                  const note = cur?.note ?? prev?.note
                  const thread = cur?.threadId ?? prev?.threadId
                  return (
                    <TableRow key={r}>
                      <TableCell className="pl-4 text-[13px] font-medium">{REGULATIONS[r].label}</TableCell>
                      <TableCell>{prev ? <ComplianceBadge status={prev.status} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {cur ? <ComplianceBadge status={cur.status} /> : <span className="text-xs text-muted-foreground">—</span>}
                        {cur?.due && <span className="ml-2 text-[11px] text-muted-foreground">due {fmtDate(cur.due + "T06:30:00Z")}</span>}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-[13px] text-muted-foreground">{note ?? "—"}</TableCell>
                      <TableCell className="pr-4 text-right">
                        {thread ? <CardLink href={inboxHref({ view: "all", t: thread })}>Open email</CardLink> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {tab === "timeline" && (
          <SectionCard title="Regulatory & operational timeline" bodyClassName="p-3">
            <Timeline events={events} />
          </SectionCard>
        )}
      </div>
    </div>
  )
}

const VOYAGE_FACTS: [string, string][] = [
  ["number", "Voyage"],
  ["location", "Location"],
  ["port", "Port"],
  ["condition", "Condition"],
  ["next_port", "Next port"],
  ["eta_raw", "ETA (ship time)"],
  ["distance_to_go_nm", "Distance to go (nm)"],
  ["projected_speed_kn", "Projected speed (kn)"],
  ["latitude", "Latitude"],
  ["longitude", "Longitude"],
]

/** Voyage facts and bunker ROB of one report, as the vessel wrote them. */
function ReportSummary({ r }: { r: Report }) {
  const d = r.data!
  return (
    <div className="space-y-3 text-[13px]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {VOYAGE_FACTS.filter(([k]) => d.voyage[k] !== undefined).map(([k, label]) => (
          <Fact key={k} label={label}>
            {String(d.voyage[k])}
          </Fact>
        ))}
        <Fact label={`Report time${d.tz_assumed ? " (zone assumed UTC)" : ""}`}>{d.at_raw ?? fmtDateTime(r.at)}</Fact>
      </dl>
      {d.bunkers.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground">Bunker ROB</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {d.bunkers.map((b) => (
              <li key={b.fuel} className="rounded-md border bg-card px-2 py-1 text-xs">
                <span className="text-muted-foreground">{b.fuel}</span> <span className="font-medium tabular">{b["ROB End"] ?? b["BDN Quantity"]}</span> {b.unit}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {d.form ?? r.type} · from {!r.source || r.source === "body" ? "the email body" : r.source}
      </p>
    </div>
  )
}

/** Every reading in the report, grouped by the form's own sections. */
function ReportReadings({ r }: { r: Report }) {
  const sections = Map.groupBy(r.data!.readings, (x) => x.section)
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[...sections].map(([section, rows]) => (
        <section key={section}>
          <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{section}</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
            {rows.map((x, i) => (
              <div key={i} className="contents">
                <dt className="truncate text-muted-foreground" title={x.group ? `${x.group} · ${x.label}` : x.label}>
                  {x.group && <span className="text-foreground/60">{x.group} · </span>}
                  {x.label}
                </dt>
                <dd className="text-right font-medium whitespace-pre-line text-foreground tabular">
                  {x.raw}
                  {x.unit && <span className="ml-1 font-normal text-muted-foreground">{x.unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
