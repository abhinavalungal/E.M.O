"use client"

import Link from "next/link"
import { AlertOctagon, AlertTriangle, ArrowRight, Bell, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { daysUntil, fmtAgo, fmtMoney, fmtNum, fmtShortDate, fmtToday, isToday as isTodayIst, slaState } from "@/lib/format"
import { inboxHref } from "@/lib/query"
import { responseWeekly, volumeWeekly } from "@/lib/metrics"
import { inView, useStore } from "@/lib/store"
import type { Alert, Role, Thread } from "@/lib/types"
import { CardLink, PageHeader, SectionCard, StatTile } from "./page"
import { CiiDistribution } from "./cii"
import { CategoryChip, PriorityIcon, SlaPill, StatusPill, UserAvatar } from "./pills"
import { ResponseChart, VolumeChart } from "./charts"

const isToday = (t: Thread) => isTodayIst(t.messages[t.messages.length - 1].at)
const open = (t: Thread) => t.status !== "resolved"

const DAY = 86_400_000
const inboundSince = (threads: Thread[], ms: number, now = Date.now()) =>
  threads.flatMap((t) => t.messages).filter((m) => m.direction === "in" && now - Date.parse(m.at) < ms).length
const money = (rows: { amount: number; currency: string }[]) =>
  Object.entries(Object.groupBy(rows, (r) => r.currency))
    .map(([c, rs]) => fmtMoney(rs!.reduce((s, r) => s + r.amount, 0), c, true))
    .join(" · ")

function kpis(role: Role, s: ReturnType<typeof useStore>) {
  const { threads, me, invoices, reports, compliance, obligations, vessels, txns } = s
  const overdue = invoices.filter((i) => i.status !== "paid" && i.status !== "draft" && (i.status === "overdue" || daysUntil(i.due) < 0))
  const breached = (t: Thread) => open(t) && slaState(t.slaDueAt)?.tone === "bad"
  const reportsIn = (from: number, to: number) =>
    threads
      .filter((t) => t.labels[0].category === "vessel_report")
      .flatMap((t) => t.messages)
      .filter((m) => m.direction === "in" && Date.now() - Date.parse(m.at) >= from && Date.now() - Date.parse(m.at) < to).length
  switch (role) {
    case "analyst": {
      const missing = reports.filter((r) => r.status === "missing")
      const week = reportsIn(0, 7 * DAY)
      const prev = reportsIn(7 * DAY, 14 * DAY)
      return [
        { label: "My open items", value: threads.filter((t) => inView(t, "mine", me.id)).length, href: "/inbox?view=mine", sub: "Assigned to you" },
        { label: "BDN received today", value: threads.filter((t) => t.labels[0].category === "bdn" && isToday(t)).length, href: "/inbox?view=all&cat=bdn&date=today", sub: "Classified by rules" },
        { label: "Missing reports", value: missing.length, href: "/alerts", sub: `${missing.filter((r) => r.type === "BDN").length} BDN · ${missing.filter((r) => r.type !== "BDN").length} vessel reports`, tone: missing.length ? ("bad" as const) : undefined },
        { label: "Vessel reports this week", value: fmtNum(week), href: "/inbox?view=all&cat=vessel_report&date=7d", sub: prev ? `${week >= prev ? "+" : ""}${Math.round(((week - prev) / prev) * 100)}% vs last week` : "Last 7 days" },
      ]
    }
    case "commercial": {
      const queries = threads.filter((t) => t.labels.some((l) => l.category === "customer_query") && open(t))
      const pending = s.allocations.filter((a) => a.status !== "confirmed")
      const oldest = pending.map((a) => a.requestedAt).sort()[0]
      return [
        { label: "Open customer queries", value: queries.length, href: "/inbox?view=action&cat=customer_query", sub: `${queries.filter(breached).length} SLA breached`, tone: queries.some(breached) ? ("bad" as const) : undefined },
        { label: "Allocations pending", value: pending.length, href: "/commercial?tab=allocations", sub: oldest ? `Oldest requested ${fmtAgo(oldest)}` : "None open", tone: pending.length ? ("warn" as const) : undefined },
        { label: "Trades to book", value: txns.filter((x) => x.status === "proposed").length, href: "/commercial?tab=carbon", sub: "Proposed, awaiting confirmation" },
        { label: "Invoices overdue", value: overdue.length, href: "/commercial?tab=invoices", sub: money(overdue) || "None", tone: overdue.length ? ("bad" as const) : undefined },
      ]
    }
    case "regulatory": {
      const actions = compliance.filter((c) => c.status === "action_required" || c.status === "overdue")
      const period = obligations[0]?.period
      const short = obligations.filter((o) => o.period === period && o.euEts.surrendered < o.euEts.required)
      return [
        { label: "Compliance actions", value: actions.length, href: "/compliance", sub: `Across ${new Set(actions.map((c) => c.imo)).size} vessels`, tone: actions.length ? ("bad" as const) : undefined },
        { label: "EU ETS surrender outstanding", value: short.length, href: "/compliance?tab=company", sub: period ? `Companies short for ${period}` : "No obligations recorded", tone: short.length ? ("bad" as const) : undefined },
        { label: "Fleet CII 2025 · D or E", value: vessels.filter((v) => (v.cii2025 ?? "") >= "D").length, href: "/compliance", sub: vessels.length ? <CiiDistribution compact ratings={vessels.map((v) => v.cii2025)} /> : "No vessels recorded" },
        { label: "Open regulatory emails", value: threads.filter((t) => ["imo_dcs", "eu_mrv", "fueleu", "seemp", "eu_ets", "uk_ets"].includes(t.labels[0].category) && open(t)).length, href: "/inbox?view=action&cat=fueleu", sub: "FuelEU, SEEMP, UK ETS…" },
      ]
    }
    default: {
      const week = inboundSince(threads, 7 * DAY)
      return [
        { label: "Unassigned", value: threads.filter((t) => inView(t, "unassigned", me.id)).length, href: "/inbox?view=unassigned", sub: "Waiting for triage" },
        { label: "SLA breached / at risk", value: threads.filter((t) => open(t) && t.slaDueAt && slaState(t.slaDueAt)?.tone !== "ok").length, href: "/inbox?view=action", sub: "Customer emails", tone: "bad" as const },
        { label: "Needs review", value: threads.filter((t) => t.needsReview).length, href: "/inbox?view=review", sub: "Low-confidence classification", tone: "warn" as const },
        { label: "Emails this week", value: fmtNum(week), href: "/inbox?view=all&date=7d", sub: `~${Math.round(week / 7)} per day` },
      ]
    }
  }
}

const SEVERITY = {
  critical: { icon: AlertOctagon, cls: "text-bad" },
  high: { icon: AlertTriangle, cls: "text-[#d9622b]" },
  medium: { icon: Info, cls: "text-warn" },
  low: { icon: Bell, cls: "text-muted-foreground" },
}

export function AlertRow({ a }: { a: Alert }) {
  const S = SEVERITY[a.severity]
  return (
    <Link href={a.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <S.icon className={cn("mt-0.5 size-4 shrink-0", S.cls)} aria-label={a.severity} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug font-medium text-foreground">{a.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{a.detail}</span>
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtAgo(a.at)}</span>
    </Link>
  )
}

function QueueRow({ t }: { t: Thread }) {
  return (
    <Link href={inboxHref({ view: "all", t: t.id })} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
      <PriorityIcon priority={t.priority} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{t.subject}</span>
        <span className="mt-1 flex items-center gap-1.5">
          <CategoryChip category={t.labels[0].category} />
          <StatusPill status={t.status} />
          <SlaPill state={slaState(t.slaDueAt)} />
        </span>
      </span>
      <UserAvatar userId={t.assigneeId} size="sm" />
    </Link>
  )
}

export function HomeDashboard() {
  const store = useStore()
  const { me, role, threads, alerts, users, deadlines } = store
  const myAlerts = alerts.filter((a) => a.status === "open" && store.alertForMe(a))
  const queue =
    role === "admin"
      ? threads.filter((t) => open(t) && (inView(t, "unassigned", me.id) || t.priority === "urgent" || t.needsReview))
      : threads.filter((t) => inView(t, "mine", me.id))
  const needMe = threads.filter((t) => inView(t, "mine", me.id) && (t.status === "open" || t.status === "new")).length
  const breaches = threads.filter((t) => open(t) && slaState(t.slaDueAt)?.tone === "bad").length
  const tiles = kpis(role, store)
  const upcoming = deadlines.filter((d) => daysUntil(d.date) >= 0)
  const workload = users.filter((u) => u.role !== "admin").map((u) => ({ u, n: threads.filter((t) => t.assigneeId === u.id && open(t)).length }))
  const maxLoad = Math.max(...workload.map((w) => w.n), 1)

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${fmtToday()} · ${store.myRole?.label ?? role} view`}
        actions={
          <dl className="flex divide-x rounded-md border bg-background text-center">
            {[
              ["New in 24h", String(inboundSince(threads, DAY)), ""],
              ["Need you", String(needMe), ""],
              ["SLA breached", String(breaches), breaches ? "text-bad" : ""],
            ].map(([label, value, cls]) => (
              <div key={label} className="px-4 py-1.5">
                <dd className={cn("text-[15px] font-semibold tabular", cls)}>{value}</dd>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        }
      />
      <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 md:px-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((k) => (
          <StatTile key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title={role === "admin" ? "Needs triage" : "My queue"}
          action={<CardLink href={role === "admin" ? "/inbox?view=unassigned" : "/inbox?view=mine"}>Open inbox</CardLink>}
          bodyClassName="divide-y"
        >
          {queue.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-ok" /> You&apos;re all caught up.
            </p>
          ) : (
            queue.slice(0, 6).map((t) => <QueueRow key={t.id} t={t} />)
          )}
        </SectionCard>

        <SectionCard title="Needs attention" action={<CardLink href="/alerts">All alerts</CardLink>} bodyClassName="divide-y">
          {myAlerts.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-ok" /> Nothing needs attention.
            </p>
          ) : (
            myAlerts.slice(0, 5).map((a) => <AlertRow key={a.id} a={a} />)
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Upcoming deadlines" action={<CardLink href="/compliance?tab=deadlines">Calendar</CardLink>} bodyClassName="divide-y">
          {upcoming.length === 0 && <p className="px-4 py-10 text-sm text-muted-foreground">No upcoming deadlines recorded.</p>}
          {upcoming.slice(0, 5).map((d) => {
            const days = daysUntil(d.date)
            return (
              <Link key={d.id} href={d.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                <span className="flex w-10 shrink-0 flex-col items-center rounded-md border bg-background py-1 leading-none text-foreground">
                  <span className="text-[10px] text-muted-foreground uppercase">{fmtShortDate(d.date + "T06:30:00Z").split(" ")[1]}</span>
                  <span className="text-[15px] font-semibold">{fmtShortDate(d.date + "T06:30:00Z").split(" ")[0]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">{d.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{d.scope}</span>
                </span>
                <span className={cn("shrink-0 text-[11px] font-medium", days <= 7 ? "text-bad" : days <= 30 ? "text-warn" : "text-muted-foreground")}>
                  in {days}d
                </span>
              </Link>
            )
          })}
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          title="Inbound email by category"
          action={<span className="text-xs text-muted-foreground">Weekly · last 8 weeks</span>}
          bodyClassName="px-3 pt-3 pb-2"
        >
          <VolumeChart data={volumeWeekly(threads)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Median first response to customer queries"
          action={<span className="text-xs text-muted-foreground">Calendar hours · last 8 weeks</span>}
          bodyClassName="px-3 pt-3 pb-2"
        >
          <ResponseChart data={responseWeekly(threads)} />
        </SectionCard>
        <SectionCard title="Team workload" action={<span className="text-xs text-muted-foreground">Open items</span>} bodyClassName="space-y-2.5 p-4">
          {workload.map(({ u, n }) => (
            <div key={u.id} className="flex items-center gap-3">
              <UserAvatar userId={u.id} size="sm" />
              <span className="w-32 truncate text-[13px] text-foreground">{u.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted">
                <span className="block h-full rounded-sm bg-sky" style={{ width: `${(n / maxLoad) * 100}%` }} />
              </span>
              <span className="w-5 text-right text-[13px] font-medium tabular">{n}</span>
            </div>
          ))}
          <Link href="/inbox?view=unassigned" className="flex items-center gap-1 pt-1 text-xs font-medium text-sky hover:underline">
            Balance the queue <ArrowRight className="size-3" />
          </Link>
        </SectionCard>
      </div>

      </div>
    </>
  )
}
