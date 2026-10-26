"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Search, Ship } from "lucide-react"
import { cn } from "@/lib/utils"
import { REGULATIONS } from "@/lib/data"
import { fmtAgo, fmtDate, fmtDateTime } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Regulation } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { COMPLIANCE as COMPLIANCE_UI, Imo } from "./pills"
import { CiiBadge } from "./cii"
import { EmptyState, PageHeader } from "./page"

const DOT: Record<string, string> = { ok: "bg-ok", info: "bg-info", neutral: "bg-foreground/20", warn: "bg-[#fab219]", bad: "bg-bad", brand: "bg-brand" }

export function VesselsTable() {
  const router = useRouter()
  const { threads, vessels, customers, compliance, orgById, loadedAt, reportSync } = useStore()
  const [q, setQ] = useState("")
  const [customer, setCustomer] = useState("")
  const year = new Date().getFullYear()
  const rows = vessels.filter(
    (v) => (!customer || v.customerId === customer) && (!q || v.name.toLowerCase().includes(q.toLowerCase()) || v.imo.includes(q) || !!v.code?.toLowerCase().includes(q.toLowerCase())),
  )

  return (
    <>
      <PageHeader
        title="Vessels"
        description={`${vessels.length} vessels · created and updated from vessel reports in the mailbox, matched by IMO number or vessel code${reportSync.syncedAt ? ` · reports checked ${fmtAgo(reportSync.syncedAt)}` : ""}`}
      />
      <div className="space-y-3 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Vessel name, IMO or code"
              className="h-8 w-full rounded-lg border bg-card pr-2 pl-8 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="h-8 rounded-lg border bg-card px-2 text-[13px] outline-none focus:border-ring"
            aria-label="Filter by customer"
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {reportSync.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-xs text-bad">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>Vessel report extraction is failing — new reports may be missing: {reportSync.error}</span>
          </p>
        )}
        <div className="overflow-hidden rounded-lg border bg-card">
          {rows.length === 0 ? (
            <EmptyState
              icon={Ship}
              title={vessels.length ? "No vessels match" : "No vessels yet"}
              hint={vessels.length ? undefined : "Vessels appear when outlook-pipeline.py finds a vessel report (noon, arrival, departure, bunker) in the mailbox. Run `python outlook-pipeline.py reports` to process stored mail."}
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Vessel</TableHead>
                <TableHead className="hidden lg:table-cell">Customer</TableHead>
                <TableHead>Voyage</TableHead>
                <TableHead className="hidden md:table-cell">Next port · ETA</TableHead>
                <TableHead>Last report</TableHead>
                <TableHead>Compliance {year}</TableHead>
                <TableHead className="text-center">CII ’25</TableHead>
                <TableHead className="pr-4 text-right">Open emails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => {
                const stale = !!v.lastReportAt && loadedAt - new Date(v.lastReportAt).getTime() > 48 * 3_600_000
                const open = threads.filter((t) => t.vesselImos.includes(v.imo) && t.status !== "resolved").length
                return (
                  <TableRow key={v.imo} className="cursor-pointer" onClick={() => router.push(`/vessels/${v.imo}`)}>
                    <TableCell className="pl-4">
                      <Link href={`/vessels/${v.imo}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <span className="block text-[13px] font-medium text-foreground hover:underline">{v.name}</span>
                        <span className="flex items-center gap-1.5">
                          <Imo imo={v.imo} />
                          {v.code && <span className="font-mono text-[11px] text-muted-foreground">{v.code}</span>}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-[13px] lg:table-cell">{orgById(v.customerId)?.short ?? <span className="text-muted-foreground">{v.principal ?? "—"}</span>}</TableCell>
                    <TableCell className="text-[13px]">
                      {v.voyage || v.location ? (
                        <>
                          <span className="block">
                            {v.voyage && <span className="font-mono text-[11px] text-muted-foreground">Voy {v.voyage.no} </span>}
                            {v.location}
                          </span>
                          {v.condition && <span className="block text-[11px] text-muted-foreground">{v.condition}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-[13px] md:table-cell">
                      {v.voyage?.to ?? <span className="text-muted-foreground">—</span>}
                      {v.voyage?.eta && <span className="block text-[11px] text-muted-foreground">ETA {fmtDate(v.voyage.eta + "T06:30:00Z")}</span>}
                    </TableCell>
                    <TableCell className={cn("text-[13px]", stale ? "font-medium text-bad" : "text-muted-foreground")} title={v.lastReportAt && fmtDateTime(v.lastReportAt)}>
                      {v.lastReportAt ? (
                        <>
                          <span className="block">{fmtDate(v.lastReportAt)}</span>
                          <span className="block text-[11px]">{fmtAgo(v.lastReportAt)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {(Object.keys(REGULATIONS) as Regulation[]).map((r) => {
                          const c = compliance.find((x) => x.imo === v.imo && x.regulation === r && x.period === year)
                          if (!c) return <span key={r} title={`${REGULATIONS[r].label}: not recorded`} className="size-2.5 rounded-sm border border-dashed border-foreground/15" />
                          const ui = COMPLIANCE_UI[c.status]
                          return (
                            <Tooltip key={r}>
                              <TooltipTrigger asChild>
                                <span className={cn("size-2.5 rounded-sm", c.status === "na" ? "border border-dashed border-foreground/25" : DOT[ui.tone])} />
                              </TooltipTrigger>
                              <TooltipContent>
                                {REGULATIONS[r].label}: {ui.label}
                                {c.note ? ` — ${c.note}` : ""}
                              </TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <CiiBadge rating={v.cii2025} />
                    </TableCell>
                    <TableCell className="pr-4 text-right text-[13px] tabular">{open || <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Compliance squares: DCS · MRV · FuelEU · SEEMP I · SEEMP II · SEEMP III · UK ETS. Hover for detail.
        </p>
      </div>
    </>
  )
}
