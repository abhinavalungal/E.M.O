"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Bell,
  Building2,
  Coins,
  FileText,
  Inbox,
  LayoutDashboard,
  Mail,
  Settings2,
  ShieldCheck,
  Ship,
  Sparkles,
} from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { isValidImo } from "@/lib/imo"
import { inboxHref, parseQuery } from "@/lib/query"
import { useStore } from "@/lib/store"
import { CategoryChip, Imo, Pill, StatusPill } from "./pills"

const SUGGESTIONS = [
  "Show all BDN reports received today",
  "Pending customer queries",
  "FuelEU emails for Kestrel Horizon",
  "Invoices for Sagar Maritime",
  "Unassigned allocation requests",
]

const NAV = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Vessels", href: "/vessels", icon: Ship },
  { label: "Customers", href: "/customers", icon: Building2 },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck },
  { label: "Commercial", href: "/commercial", icon: Coins },
  { label: "Admin", href: "/admin", icon: Settings2 },
]

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const { threads, vessels, customers, invoices, orgById } = useStore()
  const [q, setQ] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const go = (href: string) => {
    onOpenChange(false)
    setQ("")
    router.push(href)
  }

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    const digits = s.match(/^(imo\s*)?(\d{7})$/)?.[2]
    const parsed = parseQuery(s, { vessels, customers })
    return {
      parsed,
      badImo: digits && !isValidImo(digits) ? digits : null,
      vessels: vessels.filter(
        (v) => v.imo === parsed.filters.vessel || v.imo.includes(s.replace(/\D/g, "") || "x") || v.name.toLowerCase().includes(s),
      ).slice(0, 5),
      customers: customers.filter((c) => c.id === parsed.filters.customer || c.name.toLowerCase().includes(s) || c.domain.includes(s)).slice(0, 4),
      threads: threads
        .filter((t) =>
          [t.subject, t.messages[0].from.email, t.messages[0].from.name, t.intel.summary, ...t.messages.map((m) => m.body)]
            .join(" ")
            .toLowerCase()
            .includes(s),
        )
        .slice(0, 6),
      invoices: invoices.filter((i) => i.id.toLowerCase().includes(s)).slice(0, 4),
    }
  }, [q, threads, vessels, customers, invoices])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-2xl" title="Search GeoEmissions">
      <Command shouldFilter={false} className="rounded-none!">
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="Search vessel, IMO, customer, email, invoice… or ask “BDN reports today”"
        />
        <CommandList className="max-h-[min(60vh,520px)]">
          <CommandEmpty>No matches. Try an IMO number, vessel name or a question.</CommandEmpty>

          {!results && (
            <>
              <CommandGroup heading="Try asking">
                {SUGGESTIONS.map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => setQ(s)}>
                    <Sparkles className="text-sky" />
                    {s}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Go to">
                {NAV.map((n) => (
                  <CommandItem key={n.href} value={n.label} onSelect={() => go(n.href)}>
                    <n.icon />
                    {n.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results && (
            <>
              {results.parsed.chips.length > 0 && (
                <CommandGroup heading="Understood as">
                  <CommandItem value="smart" onSelect={() => go(inboxHref(results.parsed.filters))}>
                    <Sparkles className="text-sky" />
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="mr-1">Open inbox filtered by</span>
                      {results.parsed.chips.map((c) => (
                        <Pill key={c} tone="info">
                          {c}
                        </Pill>
                      ))}
                    </span>
                    <ArrowRight className="ml-auto" />
                  </CommandItem>
                </CommandGroup>
              )}
              {results.badImo && (
                <CommandGroup heading="IMO check">
                  <CommandItem value="bad-imo" disabled>
                    <Ship />
                    {results.badImo} is not a valid IMO number (check digit fails)
                  </CommandItem>
                </CommandGroup>
              )}
              {results.vessels.length > 0 && (
                <CommandGroup heading="Vessels">
                  {results.vessels.map((v) => (
                    <CommandItem key={v.imo} value={v.imo} onSelect={() => go(`/vessels/${v.imo}`)}>
                      <Ship />
                      <span className="font-medium">{v.name}</span>
                      <Imo imo={v.imo} />
                      <span className="ml-auto text-xs text-muted-foreground">{orgById(v.customerId)?.short}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.customers.length > 0 && (
                <CommandGroup heading="Customers">
                  {results.customers.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => go(`/customers/${c.id}`)}>
                      <Building2 />
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{c.domain}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.threads.length > 0 && (
                <CommandGroup heading="Emails">
                  {results.threads.map((t) => (
                    <CommandItem key={t.id} value={t.id} onSelect={() => go(inboxHref({ view: "all", t: t.id }))}>
                      <Mail />
                      <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                      <CategoryChip category={t.labels[0].category} />
                      <StatusPill status={t.status} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.invoices.length > 0 && (
                <CommandGroup heading="Invoices">
                  {results.invoices.map((i) => (
                    <CommandItem key={i.id} value={i.id} onSelect={() => go(`/commercial?tab=invoices&q=${i.id}`)}>
                      <FileText />
                      <span className="font-mono text-xs">{i.id}</span>
                      <span className="truncate text-muted-foreground">{i.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
        <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ to navigate · ↵ to open · esc to close</span>
          <span>Searches the Geoemissions mailbox, vessels, customers and invoices</span>
        </div>
      </Command>
    </CommandDialog>
  )
}
