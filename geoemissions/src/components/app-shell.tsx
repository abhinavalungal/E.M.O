"use client"

import { Suspense, useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  Bell,
  BellRing,
  Building2,
  Check,
  ChevronsUpDown,
  Coins,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Ship,
  UserRound,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { syncNow } from "@/app/actions"
import { syncStale } from "@/lib/alerts"
import { MAILBOX } from "@/lib/data"
import { fmtAgo, fmtDateTime } from "@/lib/format"
import { inView, useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CommandMenu } from "./command-menu"
import { UserAvatar } from "./pills"

const INBOX_VIEWS = [
  { view: "mine", label: "My queue" },
  { view: "unassigned", label: "Unassigned" },
  { view: "review", label: "Needs review" },
  { view: "waiting", label: "Waiting" },
  { view: "all", label: "All mail" },
]

function NavLink({
  href,
  icon: Icon,
  label,
  count,
  active,
  alert,
  onNavigate,
}: {
  href: string
  icon?: React.ElementType
  label: string
  count?: number
  active: boolean
  alert?: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        Icon ? "h-8 text-[13px] font-medium" : "h-7 pl-9 text-[12.5px]",
        active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
      )}
    >
      {Icon && <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-sidebar-muted")} />}
      <span className="truncate">{label}</span>
      {!!count && (
        <span
          className={cn(
            "ml-auto min-w-5 rounded px-1 text-center text-[11px] font-medium tabular",
            alert ? "bg-bad text-white" : active ? "text-white/80" : "text-sidebar-muted",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-sidebar-muted uppercase">{children}</div>
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { threads, alerts, me, can, alertForMe } = useStore()
  const view = params.get("view")
  const onInbox = pathname === "/inbox"
  const query = new URLSearchParams(params)
  query.delete("t") // the open thread isn't part of a saved view
  const count = (v: string) => threads.filter((t) => inView(t, v, me.id)).length
  const openAlerts = alerts.filter((a) => a.status === "open" && alertForMe(a)).length
  const is = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p))

  return (
    <nav className="flex flex-col gap-px px-2.5" aria-label="Main">
      <NavLink href="/" icon={LayoutDashboard} label="Overview" active={is("/")} onNavigate={onNavigate} />
      <NavLink href="/inbox" icon={Inbox} label="Inbox" count={count("action")} active={onInbox && !view} onNavigate={onNavigate} />
      {INBOX_VIEWS.map((v) => (
        <NavLink
          key={v.view}
          href={`/inbox?view=${v.view}`}
          label={v.label}
          count={v.view === "all" ? undefined : count(v.view)}
          active={onInbox && view === v.view}
          onNavigate={onNavigate}
        />
      ))}
      {me.views?.map((v) => (
        <NavLink key={v.name} href={`/inbox?${v.query}`} label={v.name} active={onInbox && query.toString() === v.query} onNavigate={onNavigate} />
      ))}
      <NavLink href="/alerts" icon={Bell} label="Alerts" count={openAlerts} alert active={is("/alerts")} onNavigate={onNavigate} />

      <SectionLabel>Fleet</SectionLabel>
      <NavLink href="/vessels" icon={Ship} label="Vessels" active={is("/vessels")} onNavigate={onNavigate} />
      <NavLink href="/customers" icon={Building2} label="Customers" active={is("/customers")} onNavigate={onNavigate} />

      <SectionLabel>Operations</SectionLabel>
      <NavLink href="/compliance" icon={ShieldCheck} label="Compliance" active={is("/compliance")} onNavigate={onNavigate} />
      <NavLink href="/commercial" icon={Coins} label="Commercial" active={is("/commercial")} onNavigate={onNavigate} />
      {can("admin") && (
        <>
          <SectionLabel>Workspace</SectionLabel>
          <NavLink href="/admin" icon={Settings2} label="Administration" active={is("/admin")} onNavigate={onNavigate} />
        </>
      )}
    </nav>
  )
}

function ProfileMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { me, myRole, roleById, setMe, users } = useStore()
  const router = useRouter()
  const go = (href: string) => {
    onNavigate?.()
    router.push(href)
  }
  const roleLabel = `${myRole?.label ?? me.role}${me.lead ? " · Lead" : ""}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent">
        <UserAvatar userId={me.id} size="sm" className="size-7" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium text-white">{me.name}</span>
          <span className="block truncate text-[11px] text-sidebar-muted">{roleLabel}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-[252px]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <UserAvatar userId={me.id} size="md" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold text-foreground">{me.name}</p>
            <p className="truncate text-xs text-muted-foreground">{me.email}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("/profile")}>
          <UserRound /> Profile & preferences
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("/profile#notifications")}>
          <BellRing /> Notification settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Users /> Signed in as
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Team (until Microsoft sign-in)</DropdownMenuLabel>
            {users.map((u) => (
              <DropdownMenuItem key={u.id} onSelect={() => setMe(u.id)}>
                <UserAvatar userId={u.id} size="xs" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px]">{u.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{roleById(u.role)?.label ?? u.role}</span>
                </span>
                {u.id === me.id && <Check className="text-foreground" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => go("/login")}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { sync, loadedAt } = useStore()
  const live = !syncStale(sync, loadedAt)
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="px-4 pt-5 pb-4">
        <Link href="/" onClick={onNavigate} className="block w-fit" aria-label="GeoEmissions overview">
          <Image src="/brand/geoserve-wordmark-white.png" alt="GeoServe" width={128} height={24} priority />
        </Link>
        <p className="mt-2.5 text-[10.5px] font-semibold tracking-[0.12em] text-sidebar-muted uppercase">Emissions Workspace</p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mx-4 mb-2 flex items-center gap-2 border-t border-sidebar-border pt-3 text-[11px] text-sidebar-muted">
            <span className={cn("size-1.5 shrink-0 rounded-full", live ? "bg-[#3fb27f]" : "bg-[#fab219]")} aria-hidden />
            <span className="truncate">{MAILBOX}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{sync.error ?? (sync.syncedAt ? `Mailbox last synced ${fmtAgo(sync.syncedAt)}` : "Mailbox has never synced")}</TooltipContent>
      </Tooltip>
      <div className="scrollbar-dark min-h-0 flex-1 overflow-y-auto pb-4">
        <Suspense fallback={null}>
          <SidebarNav onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="border-t border-sidebar-border p-2">
        <ProfileMenu onNavigate={onNavigate} />
      </div>
    </div>
  )
}

/** Runs the mailbox sync now (the app also syncs by itself every hour). */
function SyncNow() {
  const { me } = useStore()
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = () =>
    start(async () => {
      const { error } = await syncNow(me.id).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
      if (error) toast.error("Mailbox sync failed", { description: error })
      else toast.success("Mailbox synced", { description: "New mail and vessel reports are in." })
      router.refresh()
    })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={run} disabled={pending} aria-label={pending ? "Syncing mailbox" : "Sync mailbox now"}>
          <RefreshCw className={cn(pending && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{pending ? "Syncing the mailbox…" : "Sync now"}</TooltipContent>
    </Tooltip>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const { alerts, alertForMe, sync, loadedAt } = useStore()
  const critical = alerts.filter((a) => a.status === "open" && alertForMe(a) && a.severity === "critical").length
  const stale = syncStale(sync, loadedAt)

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-[232px] shrink-0 lg:block">
        <SidebarBody />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[260px] border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3 md:px-4">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Image src="/brand/geoserve-mark.png" alt="GeoServe" width={24} height={24} className="rounded-[4px] lg:hidden" />
          <button
            onClick={() => setCmdOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border bg-background px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/25"
          >
            <Search className="size-4" />
            <span className="truncate">Search vessels, IMO, customers, emails…</span>
            <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "hidden rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap sm:inline",
                    sync.error || stale ? "border-warn/40 bg-warn-soft text-warn" : "border-dashed text-muted-foreground",
                  )}
                >
                  {sync.error ? "Mailbox offline" : stale ? "Mail sync stale" : `Live mail · ${fmtAgo(sync.syncedAt!)}`}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {sync.error ??
                  (sync.syncedAt
                    ? `${MAILBOX} last synced ${fmtDateTime(sync.syncedAt)}${stale ? " — overdue; use Sync now" : ". The app syncs every hour; Sync now runs it any time"}.`
                    : "Mail has never synced. Use Sync now.")}
              </TooltipContent>
            </Tooltip>
            <SyncNow />
            <Button variant="ghost" size="icon-sm" asChild aria-label={`Alerts${critical ? `, ${critical} critical` : ""}`}>
              <Link href="/alerts" className="relative">
                <Bell />
                {critical > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-bad text-[9px] font-bold text-white">
                    {critical}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  )
}
