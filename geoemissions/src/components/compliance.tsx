"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarClock, Info, Ship } from "lucide-react"
import { cn } from "@/lib/utils"
import { REGULATIONS } from "@/lib/data"
import { useStore } from "@/lib/store"
import { daysUntil, fmtDate, fmtNum } from "@/lib/format"
import type { Regulation } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState, PageHeader, SectionCard } from "./page"
import { COMPLIANCE as UI, ComplianceBadge, Imo, Pill } from "./pills"
import { CiiBadge, CiiDistribution } from "./cii"
import { UrlTabs } from "./url-tabs"

const REGS = Object.keys(REGULATIONS) as Regulation[]
const CELL: Record<string, string> = {
  ok: "bg-ok-soft text-ok",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-brand-soft text-brand",
}

export function CompliancePage({ tab, period, customer }: { tab: string; period: number; customer: string }) {
  const router = useRouter()
  const { vessels: allVessels, compliance, obligations: allObligations, customers, deadlines, orgById } = useStore()
  const vessels = allVessels.filter((v) => !customer || v.customerId === customer)
  const items = compliance.filter((c) => c.period === period && vessels.some((v) => v.imo === c.imo))
  const actions = compliance.filter((c) => c.status === "action_required" || c.status === "overdue").length
  const years = [...new Set([...compliance.map((c) => c.period), period])].sort()
  const obligationYear = allObligations[0]?.period // loaded newest period first
  const obligations = allObligations.filter((o) => o.period === obligationYear)
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams({ tab, period: String(period), ...(customer ? { customer } : {}) })
    for (const [k, v] of Object.entries(patch)) {
      if (v === "") p.delete(k)
      else p.set(k, String(v))
    }
    return `/compliance?${p}`
  }

  return (
    <>
      <PageHeader
        title="Compliance"
        description="Vessel-level status per regulation and reporting year, plus company-level obligations. Status changes proposed from email are confirmed by the regulatory team."
      >
        <UrlTabs
          base="/compliance"
          current={tab}
          extra={`&period=${period}${customer ? `&customer=${customer}` : ""}`}
          tabs={[
            { value: "matrix", label: "Fleet matrix", count: actions },
            { value: "company", label: "Company obligations", count: obligations.filter((o) => o.euEts.surrendered < o.euEts.required).length },
            { value: "deadlines", label: "Deadlines" },
          ]}
        />
      </PageHeader>

      <div className="space-y-4 px-4 py-5 md:px-6">
        {tab === "matrix" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border bg-card p-0.5">
                {years.map((y) => (
                  <Link
                    key={y}
                    href={qs({ period: y })}
                    scroll={false}
                    className={cn("rounded-md px-3 py-1 text-xs font-medium", period === y ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground")}
                  >
                    {y}
                  </Link>
                ))}
              </div>
              <select
                value={customer}
                onChange={(e) => router.replace(qs({ customer: e.target.value }), { scroll: false })}
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
              <span className="ml-auto text-xs text-muted-foreground">
                {items.length} status records for reporting year {period}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {REGS.map((r) => {
                const rs = items.filter((c) => c.regulation === r && c.status !== "na")
                const done = rs.filter((c) => ["complete", "submitted", "in_progress"].includes(c.status)).length
                const bad = rs.filter((c) => c.status === "action_required" || c.status === "overdue").length
                return (
                  <div key={r} className="rounded-lg border bg-card p-3">
                    <div className="text-xs font-medium text-muted-foreground">{REGULATIONS[r].short}</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-semibold tabular">{rs.length ? Math.round((done / rs.length) * 100) : 0}%</span>
                      <span className="text-[11px] text-muted-foreground">on track</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-soft">
                      <div className="h-full rounded-full bg-sky" style={{ width: `${rs.length ? (done / rs.length) * 100 : 0}%` }} />
                    </div>
                    <div className={cn("mt-1.5 text-[11px]", bad ? "font-medium text-bad" : "text-muted-foreground")}>
                      {bad ? `${bad} need action` : `${rs.length} vessels in scope`}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border bg-card px-4 py-3">
              <div className="min-w-[260px] flex-1">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Fleet CII 2025 · attained ratings</div>
                <CiiDistribution ratings={vessels.map((v) => v.cii2025)} />
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                Vessels rated D for three consecutive years, or E once, need a corrective action plan in SEEMP Part III.{" "}
                {vessels.some((v) => (v.cii2025 ?? "") >= "D") && (
                  <span className="text-foreground">
                    At D: {vessels.filter((v) => (v.cii2025 ?? "") >= "D").map((v) => v.name).join(", ")}.
                  </span>
                )}
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card">
              {vessels.length === 0 ? (
                <EmptyState icon={Ship} title="No vessels yet" hint="Add vessels and their compliance_items rows in Supabase." />
              ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="sticky left-0 bg-muted/40 pl-4 text-xs">Vessel</TableHead>
                    {REGS.map((r) => (
                      <TableHead key={r} className="text-center text-xs">
                        {REGULATIONS[r].short}
                      </TableHead>
                    ))}
                    <TableHead className="pr-4 text-center text-xs">CII ’25</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vessels.map((v) => (
                    <TableRow key={v.imo} className="cursor-pointer" onClick={() => router.push(`/vessels/${v.imo}?tab=compliance`)}>
                      <TableCell className="sticky left-0 bg-card pl-4">
                        <span className="block text-[13px] font-medium whitespace-nowrap text-foreground">{v.name}</span>
                        <span className="flex items-center gap-1.5">
                          <Imo imo={v.imo} />
                          <span className="text-[11px] text-muted-foreground">· {orgById(v.customerId)?.short}</span>
                        </span>
                      </TableCell>
                      {REGS.map((r) => {
                        const c = items.find((x) => x.imo === v.imo && x.regulation === r)
                        if (!c)
                          return (
                            <TableCell key={r} className="px-1.5 text-center text-[11px] text-muted-foreground/50" title="No status recorded">
                              —
                            </TableCell>
                          )
                        const ui = UI[c.status]
                        return (
                          <TableCell key={r} className="px-1.5 text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "inline-flex h-7 w-full min-w-[84px] items-center justify-center gap-1 rounded-md text-[11px] font-medium",
                                    c.status === "na" ? "text-muted-foreground/50" : CELL[ui.tone],
                                  )}
                                >
                                  <ui.icon className="size-3" />
                                  {c.status === "action_required" ? "Action" : ui.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium">
                                  {REGULATIONS[r].label} · {period}: {ui.label}
                                </p>
                                {c.note && <p className="opacity-80">{c.note}</p>}
                                {c.due && <p className="opacity-80">Due {fmtDate(c.due + "T06:30:00Z")}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        )
                      })}
                      <TableCell className="pr-4 text-center">
                        <CiiBadge rating={v.cii2025} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </div>
          </>
        )}

        {tab === "company" && (
          <>
            <div className="flex items-start gap-2.5 rounded-lg border bg-card px-4 py-3 text-[13px]">
              <Info className="mt-0.5 size-4 shrink-0 text-info" />
              <p className="text-foreground/80">
                EU ETS surrender and FuelEU penalties sit with the <span className="font-medium text-foreground">shipping company</span>, not the vessel.
                Allowances for a year&apos;s emissions are surrendered by <span className="font-medium text-foreground">30 September</span> of the next year
                (2025 emissions at 70%, 2026 onwards at 100%).
              </p>
            </div>
            <SectionCard title={`EU ETS · FuelEU · UK ETS by company${obligationYear ? ` · ${obligationYear}` : ""}`}>
              {obligations.length === 0 ? (
                <EmptyState icon={Info} title="No company obligations recorded" hint="Add rows to company_obligations in Supabase." />
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-4 text-xs">Company</TableHead>
                      <TableHead className="text-right text-xs">Verified (tCO₂)</TableHead>
                      <TableHead className="text-right text-xs">EUAs required</TableHead>
                      <TableHead className="text-xs">Surrender progress</TableHead>
                      <TableHead className="text-xs">EU ETS</TableHead>
                      <TableHead className="text-right text-xs">FuelEU balance</TableHead>
                      <TableHead className="text-xs">FuelEU DoC</TableHead>
                      <TableHead className="pr-4 text-xs">UK ETS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {obligations.map((o) => {
                      const pct = o.euEts.required ? Math.min(100, (o.euEts.surrendered / o.euEts.required) * 100) : 100
                      const short = o.euEts.required - o.euEts.surrendered
                      return (
                        <TableRow key={o.customerId}>
                          <TableCell className="pl-4">
                            <Link href={`/customers/${o.customerId}`} className="text-[13px] font-medium whitespace-nowrap hover:underline">
                              {orgById(o.customerId)?.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right text-[13px] tabular">{fmtNum(o.euEts.verifiedT)}</TableCell>
                          <TableCell className="text-right text-[13px] tabular">{fmtNum(o.euEts.required)}</TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky-soft">
                                <div className={cn("h-full rounded-full", short > 0 ? "bg-[#ec835a]" : "bg-sky")} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={cn("w-20 text-right text-[11px] tabular", short > 0 ? "font-medium text-bad" : "text-muted-foreground")}>
                                {short > 0 ? `−${fmtNum(short)}` : "Surrendered"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ComplianceBadge status={o.euEts.status} />
                          </TableCell>
                          <TableCell className={cn("text-right text-[13px] tabular", o.fuelEu.balanceT < 0 ? "text-bad" : "text-ok")}>
                            {o.fuelEu.balanceT > 0 ? "+" : "−"}
                            {fmtNum(Math.abs(o.fuelEu.balanceT))} tCO₂e
                            {o.fuelEu.pool && <span className="block text-[11px] text-muted-foreground">{o.fuelEu.pool}</span>}
                          </TableCell>
                          <TableCell>
                            <ComplianceBadge status={o.fuelEu.doc} />
                          </TableCell>
                          <TableCell className="pr-4">
                            {o.ukEts ? (
                              <span className="flex flex-col gap-0.5">
                                <ComplianceBadge status={o.ukEts.status} />
                                <span className="max-w-[220px] text-[11px] text-muted-foreground">{o.ukEts.note}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">Not in scope</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              )}
            </SectionCard>
          </>
        )}

        {tab === "deadlines" && (
          <SectionCard title="Regulatory & commercial deadlines" action={<span className="text-xs text-muted-foreground">From the deadlines table</span>} bodyClassName="divide-y">
            {deadlines.length === 0 && <EmptyState icon={CalendarClock} title="No deadlines recorded" hint="Add rows to the deadlines table in Supabase." />}
            {deadlines.map((d) => {
              const days = daysUntil(d.date)
              return (
                <Link key={d.id} href={d.href} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50">
                  <CalendarClock className={cn("size-4 shrink-0", days <= 7 ? "text-bad" : days <= 45 ? "text-warn" : "text-muted-foreground")} />
                  <span className="w-28 shrink-0 text-[13px] font-medium tabular">{fmtDate(d.date + "T06:30:00Z")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{d.title}</span>
                    <span className="block text-xs text-muted-foreground">{d.scope}</span>
                  </span>
                  <Pill tone={days < 0 ? "neutral" : days <= 7 ? "bad" : days <= 45 ? "warn" : "neutral"}>{days < 0 ? `${-days} days ago` : `in ${days} days`}</Pill>
                </Link>
              )
            })}
          </SectionCard>
        )}
      </div>
    </>
  )
}
