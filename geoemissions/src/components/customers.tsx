"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, ChevronRight, Inbox, Mail, Ship } from "lucide-react"
import { fmtAgo, fmtMoney, fmtNum } from "@/lib/format"
import { inboxHref } from "@/lib/query"
import { useStore } from "@/lib/store"
import { buildTimeline } from "@/lib/timeline"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CardLink, EmptyState, PageHeader, SectionCard, StatTile } from "./page"
import { CategoryChip, ComplianceBadge, Imo, StatusPill, UserAvatar } from "./pills"
import { Timeline } from "./entity"
import { CiiBadge } from "./cii"
import { AllocationTable, InvoiceTable } from "./commercial"

export function CustomersGrid() {
  const { threads, txns, customers, vessels: allVessels, obligations, userById } = useStore()
  const router = useRouter()
  return (
    <>
      <PageHeader title="Customers" description="Shipping companies identified from sender domains. Emails, vessels, allocations and invoices roll up to each customer." />
      <div className="px-4 py-5 md:px-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          {customers.length === 0 ? (
            <EmptyState icon={Building2} title="No customers yet" hint="Add organisations with kind = customer to the orgs table in Supabase. Their domain links incoming email." />
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4 text-xs">Customer</TableHead>
                <TableHead className="text-right text-xs">Vessels</TableHead>
                <TableHead className="text-right text-xs">Open emails</TableHead>
                <TableHead className="hidden text-xs xl:table-cell">Fleet CII 2025</TableHead>
                <TableHead className="text-right text-xs">EUA sent</TableHead>
                <TableHead className="text-xs">EU ETS</TableHead>
                <TableHead className="hidden text-xs lg:table-cell">Account owner</TableHead>
                <TableHead className="pr-4 text-right text-xs">Last email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const vessels = allVessels.filter((v) => v.customerId === c.id)
                const open = threads.filter((t) => t.customerId === c.id && t.status !== "resolved")
                const queries = open.filter((t) => t.labels.some((l) => l.category === "customer_query")).length
                const transferred = txns
                  .filter((x) => x.customerId === c.id && x.type === "transfer_out" && x.status !== "proposed")
                  .reduce((s, x) => s + x.qty, 0)
                const last = threads.filter((t) => t.customerId === c.id).flatMap((t) => t.messages).sort((x, y) => y.at.localeCompare(x.at))[0]
                const obligation = obligations.find((o) => o.customerId === c.id) // newest period first
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                    <TableCell className="pl-4">
                      <Link href={`/customers/${c.id}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <span className="block text-[13px] font-medium text-foreground hover:underline">{c.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {c.domain} · {c.country}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular">{vessels.length}</TableCell>
                    <TableCell className="text-right text-[13px] tabular">
                      {open.length || <span className="text-muted-foreground">—</span>}
                      {queries > 0 && <span className="block text-[11px] text-warn">{queries} {queries === 1 ? "query" : "queries"}</span>}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="flex gap-1">
                        {vessels.map((v) => (
                          <CiiBadge key={v.imo} rating={v.cii2025} />
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular">{transferred ? fmtNum(transferred) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{obligation && <ComplianceBadge status={obligation.euEts.status} />}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="inline-flex items-center gap-2 text-[13px]">
                        <UserAvatar userId={c.ownerId} size="xs" /> {userById(c.ownerId)?.name}
                      </span>
                    </TableCell>
                    <TableCell className="pr-4 text-right text-[13px] text-muted-foreground">{last ? fmtAgo(last.at) : "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          )}
        </div>
      </div>
    </>
  )
}

export function Customer360({ id }: { id: string }) {
  const store = useStore()
  const { threads, orgById, userById, obligations, allocations, invoices } = store
  const c = orgById(id)
  if (!c) return <EmptyState icon={Building2} title="Customer not found" />
  const vessels = store.vessels.filter((v) => v.customerId === id)
  const cThreads = threads.filter((t) => t.customerId === id).sort((a, b) => b.messages.at(-1)!.at.localeCompare(a.messages.at(-1)!.at))
  const open = cThreads.filter((t) => t.status !== "resolved")
  const obligation = obligations.find((o) => o.customerId === id)
  const inv = invoices.filter((i) => i.customerId === id && !["paid", "draft"].includes(i.status))
  const contacts = [
    ...new Map(
      cThreads.flatMap((t) => t.messages).filter((m) => m.direction === "in" && m.from.email.endsWith(c.domain)).map((m) => [m.from.email, m.from] as const),
    ).values(),
  ]
  const events = buildTimeline({ ...store, imos: vessels.map((v) => v.imo), customerId: id })
  const owner = userById(c.ownerId)

  return (
    <div>
      <div className="border-b bg-card px-4 pt-4 pb-5 md:px-6">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/customers" className="hover:text-foreground">
            Customers
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{c.name}</span>
        </nav>
        <div className="mt-2.5 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">{c.name}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {c.domain} · {c.country} · Account owner <span className="font-medium text-foreground">{owner?.name ?? "not set"}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={inboxHref({ view: "all", customer: id })}>
              <Inbox /> All emails
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Open emails" value={open.length} sub={`${open.filter((t) => t.labels.some((l) => l.category === "customer_query")).length} customer queries`} href={inboxHref({ view: "action", customer: id })} />
          <StatTile
            label={`EU ETS ${obligation?.period ?? ""} surrender`}
            value={obligation && obligation.euEts.required ? `${Math.round((obligation.euEts.surrendered / obligation.euEts.required) * 100)}%` : "—"}
            sub={obligation ? `${fmtNum(obligation.euEts.surrendered)} of ${fmtNum(obligation.euEts.required)} EUA` : undefined}
            tone={obligation && obligation.euEts.surrendered < obligation.euEts.required ? "bad" : "ok"}
            href="/compliance?tab=company"
          />
          <StatTile label="Allocations open" value={allocations.filter((a) => a.customerId === id && a.status !== "confirmed").length} href="/commercial?tab=allocations" />
          <StatTile
            label="Invoices outstanding"
            value={inv.length}
            sub={inv.map((i) => fmtMoney(i.amount, i.currency, true)).join(" · ") || "None"}
            tone={inv.some((i) => i.status === "overdue") ? "bad" : undefined}
            href="/commercial?tab=invoices"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title={`Vessels (${vessels.length})`} bodyClassName="divide-y">
            {vessels.length === 0 && <EmptyState icon={Ship} title="No vessels for this customer" />}
            {vessels.map((v) => (
              <Link key={v.imo} href={`/vessels/${v.imo}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">{v.name}</span>
                  <span className="flex items-center gap-2">
                    <Imo imo={v.imo} />
                    {v.voyage && (
                      <span className="text-[11px] text-muted-foreground">
                        {v.voyage.from ?? "—"} → {v.voyage.to ?? "—"}
                      </span>
                    )}
                  </span>
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{v.type}</span>
                <CiiBadge rating={v.cii2025} withLabel className="w-36" />
              </Link>
            ))}
          </SectionCard>
          <SectionCard title="Contacts" bodyClassName="divide-y">
            {contacts.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No emails from {c.domain} yet.</p>}
            {contacts.map((p) => (
              <div key={p.email} className="flex items-center gap-2.5 px-4 py-2.5">
                <Mail className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                </span>
              </div>
            ))}
          </SectionCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Recent communication" action={<CardLink href={inboxHref({ view: "all", customer: id })}>Open in inbox</CardLink>} bodyClassName="divide-y">
            {cThreads.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No emails linked to this customer yet.</p>}
            {cThreads.slice(0, 6).map((t) => (
              <Link key={t.id} href={inboxHref({ view: "all", t: t.id })} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{t.subject}</span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <CategoryChip category={t.labels[0].category} />
                    <StatusPill status={t.status} />
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{fmtAgo(t.messages.at(-1)!.at)}</span>
              </Link>
            ))}
          </SectionCard>
          <SectionCard title="Timeline" bodyClassName="p-3">
            <Timeline events={events} limit={7} />
          </SectionCard>
        </div>

        <SectionCard title="Allocations">
          <AllocationTable rows={allocations.filter((a) => a.customerId === id)} />
        </SectionCard>
        <SectionCard title="Invoices">
          <InvoiceTable rows={invoices.filter((i) => i.customerId === id)} />
        </SectionCard>
      </div>
    </div>
  )
}
