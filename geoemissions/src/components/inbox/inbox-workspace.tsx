"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowDownUp, Check, ChevronDown, Inbox as InboxIcon, ListFilter, MailOpen, Paperclip, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORIES, GROUPS } from "@/lib/data"
import { isToday } from "@/lib/format"
import { inView, useStore } from "@/lib/store"
import type { Category, Group, Priority, Status } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "../page"
import { PRIORITY_LABEL, STATUS } from "../pills"
import { BulkBar, SaveView, SORTS } from "./list-tools"
import { ThreadRow } from "./thread-list"
import { ThreadView } from "./thread-view"
import { IntelPanel } from "./intel-panel"
import type { ComposerHandle } from "./composer"

const VIEW_LABEL: Record<string, string> = {
  action: "Inbox",
  mine: "My queue",
  unassigned: "Unassigned",
  review: "Needs review",
  waiting: "Waiting",
  important: "Important",
  resolved: "Resolved",
  all: "All mail",
}

const GROUP_ORDER: Group[] = ["reports", "commercial", "regulatory"]

export function InboxWorkspace() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { threads, me, myRole, updateThread, users, vessels, customers, orgById, vesselByImo, loadedAt } = useStore()
  const [panelOpen, setPanelOpen] = useState(false)
  const composerRef = useRef<ComposerHandle>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const view = params.get("view") ?? "action"
  const f = {
    cat: params.get("cat") as Category | null,
    vessel: params.get("vessel"),
    customer: params.get("customer"),
    date: params.get("date"),
    q: params.get("q") ?? "",
    status: params.get("status") as Status | null,
    priority: params.get("priority") as Priority | null,
    assignee: params.get("assignee"),
    att: params.get("att"),
  }
  const selectedId = params.get("t")
  const sortKey = params.get("sort") ?? "newest"
  const sort = SORTS[sortKey] ?? SORTS.newest

  const hrefWith = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    return `${pathname}?${p.toString()}`
  }
  const setParam = (patch: Record<string, string | null>) => router.replace(hrefWith(patch), { scroll: false })

  const list = useMemo(() => {
    return threads
      .filter((t) => inView(t, view, me.id))
      .filter((t) => !f.cat || t.labels.some((l) => l.category === f.cat))
      .filter((t) => !f.vessel || t.vesselImos.includes(f.vessel))
      .filter((t) => !f.customer || t.customerId === f.customer)
      .filter((t) => !f.status || t.status === f.status)
      .filter((t) => !f.priority || t.priority === f.priority)
      .filter((t) => !f.assignee || (f.assignee === "none" ? !t.assigneeId : t.assigneeId === f.assignee))
      .filter((t) => !f.att || t.messages.some((m) => m.attachments?.length))
      .filter((t) => f.date !== "today" || isToday(t.messages[t.messages.length - 1].at))
      .filter((t) => f.date !== "7d" || loadedAt - new Date(t.messages[t.messages.length - 1].at).getTime() < 7 * 86_400_000)
      .filter((t) => {
        if (!f.q) return true
        const s = f.q.toLowerCase()
        return [t.subject, t.intel.summary, ...t.messages.map((m) => m.from.email + " " + m.body)].join(" ").toLowerCase().includes(s)
      })
      .sort((a, b) => sort.cmp(a, b, loadedAt))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, view, me.id, params])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const pickedIds = list.filter((t) => picked.has(t.id)).map((t) => t.id) // only what this view still shows

  const selected = threads.find((t) => t.id === selectedId)
  const pinned = myRole?.categories ?? []

  // Keyboard triage: j/k move, e resolve, i important, a assign to me, r reply
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable], [role=menu], [role=dialog]")) return
      const idx = list.findIndex((t) => t.id === selectedId)
      if (e.key === "j" || e.key === "k") {
        const next = list[Math.min(list.length - 1, Math.max(0, idx + (e.key === "j" ? 1 : -1)))]
        if (next) {
          setParam({ t: next.id })
          listRef.current?.querySelector(`[data-thread="${next.id}"]`)?.scrollIntoView({ block: "nearest" })
        }
      } else if (selected && e.key === "e") {
        updateThread(selected.id, { status: "resolved" })
        toast.success("Resolved", { description: selected.subject })
      } else if (selected && e.key === "i") {
        updateThread(selected.id, { important: !selected.important })
      } else if (selected && e.key === "a") {
        updateThread(selected.id, { assigneeId: me.id })
        toast.success("Assigned to you")
      } else if (selected && e.key === "r") {
        e.preventDefault()
        composerRef.current?.open("reply")
      } else return
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const chips = (
    [
      ["vessel", f.vessel && (vesselByImo(f.vessel)?.name ?? f.vessel)],
      ["customer", f.customer && (orgById(f.customer)?.short ?? f.customer)],
      ["date", f.date && (f.date === "today" ? "Received today" : "Last 7 days")],
      ["status", f.status && STATUS[f.status].label],
      ["priority", f.priority && `${PRIORITY_LABEL[f.priority]} priority`],
      ["assignee", f.assignee && (f.assignee === "none" ? "Unassigned" : users.find((u) => u.id === f.assignee)?.name)],
      ["att", f.att && "Has attachments"],
    ] as [string, string | null | undefined][]
  ).filter(([, label]) => label)

  return (
    <div className="flex h-full min-h-0">
      {/* List */}
      <section
        className={cn(
          "flex w-full min-w-0 flex-col border-r bg-card md:w-[340px] md:shrink-0 xl:w-[380px]",
          selected && "hidden md:flex",
        )}
      >
        <div className="shrink-0 space-y-2.5 border-b px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-foreground">{VIEW_LABEL[view] ?? "Inbox"}</h1>
            <span className="text-xs text-muted-foreground tabular">{list.length}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" title={`Sorted: ${sort.label}`}>
                  <ArrowDownUp /> Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(SORTS).map(([k, s]) => (
                  <DropdownMenuCheckboxItem key={k} checked={sortKey === k} onCheckedChange={() => setParam({ sort: k === "newest" ? null : k })}>
                    {s.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <SaveView />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="text-muted-foreground">
                  <ListFilter /> Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(Object.keys(STATUS) as Status[]).map((s) => (
                      <DropdownMenuCheckboxItem key={s} checked={f.status === s} onCheckedChange={(c) => setParam({ status: c ? s : null })}>
                        {STATUS[s].label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <DropdownMenuCheckboxItem key={p} checked={f.priority === p} onCheckedChange={(c) => setParam({ priority: c ? p : null })}>
                        {PRIORITY_LABEL[p]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Assignee</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuCheckboxItem checked={f.assignee === "none"} onCheckedChange={(c) => setParam({ assignee: c ? "none" : null })}>
                      Unassigned
                    </DropdownMenuCheckboxItem>
                    {users.map((u) => (
                      <DropdownMenuCheckboxItem key={u.id} checked={f.assignee === u.id} onCheckedChange={(c) => setParam({ assignee: c ? u.id : null })}>
                        {u.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Vessel</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    {vessels.map((v) => (
                      <DropdownMenuCheckboxItem key={v.imo} checked={f.vessel === v.imo} onCheckedChange={(c) => setParam({ vessel: c ? v.imo : null })}>
                        {v.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Customer</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {customers.map((c) => (
                      <DropdownMenuCheckboxItem key={c.id} checked={f.customer === c.id} onCheckedChange={(on) => setParam({ customer: on ? c.id : null })}>
                        {c.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Received</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuCheckboxItem checked={f.date === "today"} onCheckedChange={(c) => setParam({ date: c ? "today" : null })}>
                      Today
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={f.date === "7d"} onCheckedChange={(c) => setParam({ date: c ? "7d" : null })}>
                      Last 7 days
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={!!f.att} onCheckedChange={(c) => setParam({ att: c ? "1" : null })}>
                  <Paperclip /> Has attachments
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              defaultValue={f.q}
              key={f.q}
              placeholder="Search in this view"
              onKeyDown={(e) => e.key === "Enter" && setParam({ q: e.currentTarget.value || null, t: null })}
              className="h-8 w-full rounded-lg border bg-background pr-2 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            <CatButton active={!f.cat} onClick={() => setParam({ cat: null })}>
              All
            </CatButton>
            {pinned.slice(0, 3).map((c) => (
              <CatButton key={c} active={f.cat === c} onClick={() => setParam({ cat: f.cat === c ? null : c })}>
                {CATEGORIES[c].label}
              </CatButton>
            ))}
            {GROUP_ORDER.map((g) => {
              const cats = (Object.keys(CATEGORIES) as Category[]).filter((c) => CATEGORIES[c].group === g)
              const activeHere = f.cat && cats.includes(f.cat) && !pinned.slice(0, 3).includes(f.cat)
              return (
                <DropdownMenu key={g}>
                  <DropdownMenuTrigger asChild>
                    <CatButton active={!!activeHere}>
                      {activeHere ? CATEGORIES[f.cat!].label : GROUPS[g].label}
                      <ChevronDown className="size-3" />
                    </CatButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">{GROUPS[g].label}</DropdownMenuLabel>
                    {cats.map((c) => (
                      <DropdownMenuItem key={c} onSelect={() => setParam({ cat: c })}>
                        {CATEGORIES[c].label}
                        {f.cat === c && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })}
            {!pinned.includes("customer_query") && (
              <CatButton active={f.cat === "customer_query"} onClick={() => setParam({ cat: f.cat === "customer_query" ? null : "customer_query" })}>
                Queries
              </CatButton>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setParam({ [key]: null })}
                  className="inline-flex h-6 items-center gap-1 rounded-full bg-sky-soft pr-1.5 pl-2.5 text-xs font-medium text-info hover:bg-sky-soft/70"
                >
                  {label} <X className="size-3" />
                </button>
              ))}
              <button
                onClick={() => setParam({ vessel: null, customer: null, date: null, status: null, priority: null, assignee: null, att: null, q: null, cat: null, sort: null })}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {pickedIds.length > 0 && (
          <BulkBar
            ids={pickedIds}
            allPicked={pickedIds.length === list.length}
            onAll={(on) => setPicked(new Set(on ? list.map((t) => t.id) : []))}
            onClear={() => setPicked(new Set())}
          />
        )}
        <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <EmptyState icon={InboxIcon} title="Nothing here" hint="No emails match this view and filters. Clear filters or switch view." />
          ) : (
            list.map((t) => (
              <ThreadRow
                key={t.id}
                t={t}
                active={t.id === selectedId}
                href={hrefWith({ t: t.id })}
                picked={picked.has(t.id)}
                onPick={(on) => setPicked((p) => (on ? new Set(p).add(t.id) : new Set([...p].filter((x) => x !== t.id))))}
              />
            ))
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground md:flex">
          <span className="flex items-center gap-1">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>E</Kbd> resolve
          </span>
          <span className="flex items-center gap-1">
            <Kbd>A</Kbd> assign me
          </span>
          <span className="flex items-center gap-1">
            <Kbd>R</Kbd> reply
          </span>
        </div>
      </section>

      {/* Reading pane */}
      {selected ? (
        <>
          <section className="min-w-0 flex-1">
            <ThreadView
              key={selected.id}
              thread={selected}
              backHref={hrefWith({ t: null })}
              onTogglePanel={() => setPanelOpen(true)}
              composerRef={composerRef}
            />
          </section>
          <aside className="scrollbar-thin hidden w-[312px] shrink-0 overflow-y-auto border-l bg-card min-[1440px]:block">
            <IntelPanel key={selected.id} thread={selected} />
          </aside>
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetContent side="right" className="w-[340px] overflow-y-auto p-0 sm:max-w-[340px]">
              <SheetTitle className="border-b px-4 py-3 text-sm">Email intelligence</SheetTitle>
              <IntelPanel key={selected.id} thread={selected} />
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <section className="hidden min-w-0 flex-1 items-center justify-center bg-background md:flex">
          <EmptyState icon={MailOpen} title="Select an email" hint="Use J / K to move through the list, or press Ctrl K to search everything." />
        </section>
      )}
    </div>
  )
}

function CatButton({
  active,
  children,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
        active ? "border-brand bg-brand text-white" : "bg-card text-foreground/75 hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
