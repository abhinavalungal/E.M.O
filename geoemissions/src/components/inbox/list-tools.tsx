"use client"

// Inbox list tools: sort orders, saved views, and bulk actions on ticked emails.
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Bookmark, ChevronDown } from "lucide-react"
import { saveViews } from "@/app/actions"
import { CATEGORIES } from "@/lib/data"
import { useStore } from "@/lib/store"
import { unansweredHours } from "@/lib/team"
import type { Category, Priority, Status, Thread } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PRIORITY_LABEL, STATUS } from "../pills"

const PRI: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const lastAt = (t: Thread) => t.messages[t.messages.length - 1].at

export const SORTS: Record<string, { label: string; cmp: (a: Thread, b: Thread, now: number) => number }> = {
  newest: { label: "Newest first", cmp: (a, b) => lastAt(b).localeCompare(lastAt(a)) },
  oldest: { label: "Oldest first", cmp: (a, b) => lastAt(a).localeCompare(lastAt(b)) },
  priority: { label: "Priority", cmp: (a, b) => PRI[a.priority] - PRI[b.priority] || lastAt(b).localeCompare(lastAt(a)) },
  waiting: { label: "Waiting longest", cmp: (a, b, now) => (unansweredHours(b, now) ?? -1) - (unansweredHours(a, now) ?? -1) },
}

/** Saves the current inbox filters and sort under a name; saved views show in the sidebar. */
export function SaveView() {
  const { me } = useStore()
  const params = useSearchParams()
  const router = useRouter()
  const [name, setName] = useState("")
  const [open, setOpen] = useState(false)
  const save = () => {
    const query = new URLSearchParams(params)
    query.delete("t")
    saveViews(me.id, [...(me.views ?? []).filter((v) => v.name !== name.trim()), { name: name.trim(), query: query.toString() }]).then(
      () => {
        toast.success(`Saved view ${name.trim()}`, { description: "It's in the sidebar under Inbox." })
        setOpen(false)
        setName("")
        router.refresh()
      },
      (e) => toast.error("Couldn't save view", { description: e instanceof Error ? e.message : String(e) }),
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="Save this view" title="Save this view">
          <Bookmark />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <p className="text-xs text-muted-foreground">Save the current view, filters and sort.</p>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) save()
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overdue BDNs" className="h-8 text-[13px]" autoFocus aria-label="View name" />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** Shown while emails are ticked: assign, set status, category or priority on all of them at once. */
export function BulkBar({ ids, allPicked, onAll, onClear }: { ids: string[]; allPicked: boolean; onAll: (on: boolean) => void; onClear: () => void }) {
  const { updateThread, users, me, can } = useStore()
  const apply = (patch: Partial<Thread>, what: string) => {
    for (const id of ids) updateThread(id, patch)
    toast.success(`${what} · ${ids.length} email${ids.length === 1 ? "" : "s"}`)
    onClear()
  }
  const menu = (label: string, items: [string, () => void][]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="xs" className="bg-card">
          {label} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {items.map(([text, run], i) =>
          text === "-" ? (
            <DropdownMenuSeparator key={i} />
          ) : (
            <DropdownMenuItem key={text} onSelect={run}>
              {text}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-sky-soft px-4 py-2 text-xs">
      <Checkbox checked={allPicked} onCheckedChange={(c) => onAll(!!c)} aria-label="Select all in this view" />
      <span className="mr-1 font-medium text-info">{ids.length} selected</span>
      {menu("Assign", [
        ["Assign to me", () => apply({ assigneeId: me.id }, "Assigned to you")],
        ...(can("thread.assign") ? users.filter((u) => u.id !== me.id).map((u): [string, () => void] => [u.name, () => apply({ assigneeId: u.id }, `Assigned to ${u.name}`)]) : []),
        ["-", () => {}],
        ["Unassign", () => apply({ assigneeId: undefined }, "Unassigned")],
      ])}
      {menu("Status", (Object.keys(STATUS) as Status[]).map((s) => [STATUS[s].label, () => apply({ status: s }, `Marked ${STATUS[s].label}`)]))}
      {menu("Category", (Object.keys(CATEGORIES) as Category[]).map((c) => [CATEGORIES[c].label, () => apply({ labels: [{ category: c, confidence: 1, source: "human" }], needsReview: false }, `Classified as ${CATEGORIES[c].label}`)]))}
      {menu("Priority", (Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => [PRIORITY_LABEL[p], () => apply({ priority: p }, `${PRIORITY_LABEL[p]} priority`)]))}
      <Button variant="ghost" size="xs" className="ml-auto" onClick={onClear}>
        Clear
      </Button>
    </div>
  )
}
