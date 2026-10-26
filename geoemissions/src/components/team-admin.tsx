"use client"

// Administration → Users & roles, and the escalation policy (Administration → SLAs).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { saveEscalationPolicy, saveRole, saveUser } from "@/app/actions"
import { CAPABILITIES, CATEGORIES } from "@/lib/data"
import { fmtDate } from "@/lib/format"
import { useStore } from "@/lib/store"
import { isAway, type UserInput } from "@/lib/team"
import type { Availability, Capability, Category, RoleConfig, User } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionCard } from "./page"
import { Pill, UserAvatar } from "./pills"

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const AVAILABILITY: Record<Availability, string> = { available: "Available", on_leave: "On leave", unavailable: "Unavailable" }

/** "On leave until 30 Oct" for someone away now, else nothing. */
export function AwayPill({ user }: { user: User }) {
  if (!isAway(user)) return null
  return <Pill tone="warn">{`${AVAILABILITY[user.availability!]}${user.awayUntil ? ` until ${fmtDate(user.awayUntil)}` : ""}`}</Pill>
}

export function UsersAndRoles() {
  const { allUsers, roles, roleById, userById, me, threads } = useStore()
  const router = useRouter()
  const [editing, setEditing] = useState<UserInput | null>(null)
  const [local, setLocal] = useState<Record<string, RoleConfig>>({}) // role edits shown before the refresh lands
  const [newRole, setNewRole] = useState("")
  const role = (r: RoleConfig) => local[r.id] ?? r
  const team = [...allUsers].sort((a, b) => Number(a.active === false) - Number(b.active === false))

  const toggle = (r: RoleConfig, patch: Partial<RoleConfig>) => {
    const next = { ...role(r), ...patch }
    setLocal({ ...local, [r.id]: next })
    saveRole(me.id, next).then(
      () => router.refresh(),
      (e) => {
        setLocal((l) => Object.fromEntries(Object.entries(l).filter(([id]) => id !== r.id)))
        toast.error("Couldn't save role", { description: errorText(e) })
      },
    )
  }
  const addRole = () =>
    saveRole(me.id, { label: newRole, categories: [], capabilities: [] }).then(
      () => {
        toast.success(`Added role ${newRole}`, { description: "Tick the categories and capabilities it should have." })
        setNewRole("")
        router.refresh()
      },
      (e) => toast.error("Couldn't add role", { description: errorText(e) }),
    )

  const roleColumns = roles.map((r) => (
    <TableHead key={r.id} className="text-center text-xs">
      {r.label}
    </TableHead>
  ))

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <SectionCard
        className="xl:col-span-2"
        title={`Team (${allUsers.filter((u) => u.active !== false).length})`}
        action={
          <Button size="xs" variant="outline" onClick={() => setEditing({ name: "", email: "", role: roles.find((r) => !r.capabilities.includes("admin"))?.id ?? roles[0]?.id ?? "" })}>
            <UserPlus /> Add user
          </Button>
        }
        bodyClassName="divide-y"
      >
        {team.map((u) => (
          <div key={u.id} className={cn("flex items-center gap-3 px-4 py-2.5", u.active === false && "opacity-55")}>
            <UserAvatar userId={u.id} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{u.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              {u.backupId && <span className="block truncate text-[11px] text-muted-foreground">Backup: {userById(u.backupId)?.name}</span>}
            </span>
            <span className="flex flex-col items-end gap-1">
              {u.active === false ? <Pill>Removed</Pill> : <Pill tone="brand">{roleById(u.role)?.label ?? u.role}</Pill>}
              <AwayPill user={u} />
              {u.lead && <span className="text-[11px] text-muted-foreground">Lead</span>}
            </span>
            <Button variant="ghost" size="icon-xs" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>
              <Pencil />
            </Button>
          </div>
        ))}
      </SectionCard>

      <div className="space-y-4 xl:col-span-3">
        <SectionCard
          title="Roles & permissions"
          action={
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (newRole.trim()) addRole()
              }}
            >
              <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="New role name" className="h-7 w-36 text-xs" aria-label="New role name" />
              <Button size="xs" variant="outline" type="submit" disabled={!newRole.trim()}>
                <Plus /> Add role
              </Button>
            </form>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4 text-xs">Capability</TableHead>
                  {roleColumns}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(CAPABILITIES) as Capability[]).map((c) => (
                  <TableRow key={c}>
                    <TableCell className="pl-4">
                      <span className="block text-[13px]">{CAPABILITIES[c].label}</span>
                      <span className="text-[11px] text-muted-foreground">{CAPABILITIES[c].hint}</span>
                    </TableCell>
                    {roles.map((r) => (
                      <TableCell key={r.id} className="text-center">
                        <Checkbox
                          checked={role(r).capabilities.includes(c)}
                          onCheckedChange={(on) => toggle(r, { capabilities: on ? [...role(r).capabilities, c] : role(r).capabilities.filter((x) => x !== c) })}
                          aria-label={`${r.label}: ${CAPABILITIES[c].label}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Email categories by role" action={<span className="text-xs text-muted-foreground">Shared with the role automatically · sets its default inbox tabs</span>}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4 text-xs">Category</TableHead>
                  {roleColumns}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                  <TableRow key={c}>
                    <TableCell className="pl-4 text-[13px]">
                      {CATEGORIES[c].label}
                      <span className="ml-1.5 text-[11px] text-muted-foreground tabular">{threads.filter((t) => t.labels[0].category === c).length}</span>
                    </TableCell>
                    {roles.map((r) => (
                      <TableCell key={r.id} className="text-center">
                        <Checkbox
                          checked={role(r).categories.includes(c)}
                          onCheckedChange={(on) => toggle(r, { categories: on ? [...role(r).categories, c] : role(r).categories.filter((x) => x !== c) })}
                          aria-label={`${r.label}: ${CATEGORIES[c].label}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>

      {editing && <UserDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function UserDialog({ user, onClose }: { user: UserInput; onClose: () => void }) {
  const { me, roles, users, threads } = useStore()
  const router = useRouter()
  const [u, setU] = useState<UserInput>(user)
  const [saving, setSaving] = useState(false)
  const open = threads.filter((t) => t.assigneeId === u.id && t.status !== "resolved").length
  const save = (patch: Partial<UserInput> = {}) => {
    setSaving(true)
    saveUser(me.id, { ...u, ...patch }).then(
      () => {
        toast.success(patch.active === false ? `Removed ${u.name}` : `Saved ${u.name}`, patch.active === false && open ? { description: `Their ${open} open emails are covered by their backup.` } : undefined)
        router.refresh()
        onClose()
      },
      (e) => {
        setSaving(false)
        toast.error("Couldn't save user", { description: errorText(e) })
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{u.id ? `Edit ${user.name}` : "Add user"}</DialogTitle>
          <DialogDescription>Their role decides which email categories they see and what they can do.</DialogDescription>
        </DialogHeader>
        <AvailabilityFields value={u} onChange={(p) => setU({ ...u, ...p })} backups={users.filter((x) => x.id !== u.id)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Name
              <Input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Email
              <Input type="email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} placeholder="name@geoserves.com" />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Role
              <Select value={u.role} onValueChange={(role) => setU({ ...u, role })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
              <Checkbox checked={!!u.lead} onCheckedChange={(c) => setU({ ...u, lead: !!c })} /> Team lead
            </label>
          </div>
        </AvailabilityFields>
        <DialogFooter className="sm:justify-between">
          {u.id && u.id !== me.id ? (
            u.active === false ? (
              <Button variant="outline" disabled={saving} onClick={() => save({ active: true })}>
                Restore user
              </Button>
            ) : (
              <Button variant="ghost" className="text-bad" disabled={saving} onClick={() => save({ active: false })}>
                Remove from team
              </Button>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save()} disabled={saving || !u.name.trim() || !u.email.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type AvailabilityValue = Pick<UserInput, "availability" | "awayFrom" | "awayUntil" | "backupId">

/** Availability, away dates and backup: used by admins here and by each user on their profile. */
export function AvailabilityFields({
  value: v,
  onChange,
  backups,
  children,
}: {
  value: AvailabilityValue
  onChange: (p: AvailabilityValue) => void
  backups: User[]
  children?: React.ReactNode
}) {
  const away = (v.availability ?? "available") !== "available"
  return (
    <div className="space-y-3">
      {children}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Availability
          <Select value={v.availability ?? "available"} onValueChange={(a) => onChange({ availability: a as Availability, ...(a === "available" && { awayFrom: "", awayUntil: "" }) })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AVAILABILITY) as Availability[]).map((a) => (
                <SelectItem key={a} value={a}>
                  {AVAILABILITY[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Backup (covers their mail while away)
          <Select value={v.backupId || "none"} onValueChange={(b) => onChange({ backupId: b === "none" ? "" : b })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No backup</SelectItem>
              {backups.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {away && (
          <>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Away from (optional)
              <Input type="date" value={v.awayFrom ?? ""} onChange={(e) => onChange({ awayFrom: e.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Back after (optional)
              <Input type="date" value={v.awayUntil ?? ""} min={v.awayFrom || undefined} onChange={(e) => onChange({ awayUntil: e.target.value })} />
            </label>
          </>
        )}
      </div>
    </div>
  )
}

export function EscalationPolicyCard() {
  const { policy, me, can } = useStore()
  const router = useRouter()
  const [hours, setHours] = useState(String(policy.hours))
  const [reassign, setReassign] = useState(policy.reassign)
  const admin = can("admin")
  const save = () =>
    saveEscalationPolicy(me.id, { hours: Number(hours), reassign }).then(
      () => (toast.success("Escalation policy saved"), router.refresh()),
      (e) => toast.error("Couldn't save", { description: errorText(e) }),
    )
  return (
    <SectionCard title="Unanswered mail & backups" bodyClassName="space-y-3 p-4 text-[13px]">
      <p className="flex flex-wrap items-center gap-1.5">
        When an email has waited
        <Input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(e.target.value)} disabled={!admin} className="h-7 w-20 text-[13px]" aria-label="Hours without a reply" />
        hours without a reply, alert its PIC (or their backup while they are away) and the roles that handle its category.
      </p>
      <label className="flex items-start gap-2">
        <Checkbox checked={reassign} onCheckedChange={(c) => setReassign(!!c)} disabled={!admin} className="mt-0.5" />
        <span>
          Also reassign it to the PIC&apos;s backup, once per email. Open mail of a PIC who is away moves to their backup straight away.
          <span className="block text-xs text-muted-foreground">Every reassignment is recorded in the email&apos;s history and the audit log, with the original PIC.</span>
        </span>
      </label>
      {admin && (
        <Button size="sm" onClick={save}>
          Save policy
        </Button>
      )}
    </SectionCard>
  )
}
