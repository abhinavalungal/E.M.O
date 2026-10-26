"use client"

// Session state over the Supabase workspace: every change updates the screen at once and is saved through a
// server action; the page re-reads the database every 30s so teammates' changes and new mail appear.
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { addNote as addNoteAction, confirmAllocation, confirmTxn, saveAlert, saveThread, setCurrentUser, type ThreadPatch } from "@/app/actions"
import { buildAlerts, type AlertState } from "./alerts"
import { MAILBOX } from "./data"
import { can, viewer } from "./team"
import type { Alert, Allocation, CarbonTxn, Capability, Org, Role, RoleConfig, Thread, User, Vessel } from "./types"
import type { Workspace } from "./workspace"

type Store = Omit<Workspace, "alertStates" | "error" | "threads" | "txns" | "allocations"> & {
  role: Role
  myRole?: RoleConfig
  /** Whether the current user's role has a capability (the server checks again on every write). */
  can: (cap: Capability) => boolean
  roleById: (id?: string) => RoleConfig | undefined
  me: User
  setMe: (userId: string) => void
  /** Everyone, including removed users (for names in history); `users` is the active team. */
  allUsers: User[]
  customers: Org[]
  userById: (id?: string) => User | undefined
  orgById: (id?: string) => Org | undefined
  vesselByImo: (imo?: string) => Vessel | undefined
  threads: Thread[]
  updateThread: (id: string, patch: Partial<Thread>) => void
  addNote: (id: string, body: string) => void
  sendReply: (id: string, reply: { to: string[]; cc: string[]; body: string; attachments: string[] }) => void
  alerts: Alert[]
  /** Alerts for the current user: their role's, or ones they own (assignee, or backup covering for them). */
  alertForMe: (a: Alert) => boolean
  updateAlert: (id: string, patch: Pick<Alert, "status">) => void
  txns: CarbonTxn[]
  updateTxn: (id: string, patch: Pick<CarbonTxn, "status">) => void
  allocations: Allocation[]
  confirmAllocation: (id: string) => void
}

const Ctx = createContext<Store | null>(null)

const PATCH_KEYS = ["status", "priority", "important", "assigneeId", "labels", "needsReview", "snoozedUntil", "unread"] as const
const tomorrow0930Ist = () => new Date(Math.floor((Date.now() + 5.5 * 3_600_000) / 86_400_000 + 1) * 86_400_000 + 4 * 3_600_000).toISOString()

/** Saves in the background; the optimistic change stays on screen and the next refresh shows the database truth. */
const persist = (p: Promise<unknown>) => p.catch((e) => toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) }))

export function StoreProvider({ children, workspace, meId: initialMe }: { children: React.ReactNode; workspace: Workspace; meId?: string }) {
  const router = useRouter()
  const [meId, setMeId] = useState(initialMe)
  const [synced, setSynced] = useState(workspace)
  const [threads, setThreads] = useState(workspace.threads)
  const [txns, setTxns] = useState(workspace.txns)
  const [allocations, setAllocations] = useState(workspace.allocations)
  const [alertStates, setAlertStates] = useState<AlertState[]>(workspace.alertStates)

  // Fresh data from the server replaces local copies: the database is the source of truth.
  if (workspace !== synced) {
    setSynced(workspace)
    setThreads(workspace.threads)
    setTxns(workspace.txns)
    setAllocations(workspace.allocations)
    setAlertStates(workspace.alertStates)
  }

  // Re-read the database every 30s while the tab is visible (router.refresh re-runs the root layout).
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30_000)
    return () => clearInterval(id)
  }, [router])

  const { users: allUsers, roles, orgs, vessels } = workspace
  const users = useMemo(() => allUsers.filter((u) => u.active !== false), [allUsers])
  const me = viewer(allUsers, roles, meId)

  const value = useMemo<Store | null>(() => {
    if (!me) return null
    const patchThread = (id: string, fn: (t: Thread) => Thread) => setThreads((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))
    const subject = (id: string) => threads.find((t) => t.id === id)?.subject ?? id
    const alerts = buildAlerts({ ...workspace, threads, txns, allocations, states: alertStates })
    const myRole = roles.find((r) => r.id === me.role)
    return {
      ...workspace,
      users,
      allUsers,
      role: me.role,
      myRole,
      can: (cap) => can(myRole, cap),
      roleById: (id) => roles.find((r) => r.id === id),
      me,
      setMe: (id) => {
        setMeId(id)
        persist(setCurrentUser(id))
      },
      customers: orgs.filter((o) => o.kind === "customer"),
      userById: (id) => allUsers.find((u) => u.id === id),
      orgById: (id) => orgs.find((o) => o.id === id),
      vesselByImo: (imo) => vessels.find((v) => v.imo === imo),
      threads,
      updateThread: (id, patch) => {
        patchThread(id, (t) => ({ ...t, ...patch }))
        const p: ThreadPatch = {}
        for (const k of PATCH_KEYS) if (k in patch) Object.assign(p, { [k]: patch[k] ?? null })
        if (Object.keys(p).length) persist(saveThread(me.id, id, subject(id), p))
      },
      addNote: (id, body) => {
        patchThread(id, (t) => ({ ...t, notes: [...t.notes, { id: crypto.randomUUID(), authorId: me.id, at: new Date().toISOString(), body }] }))
        persist(addNoteAction(me.id, id, subject(id), body))
      },
      // ponytail: sending isn't wired to Graph yet, so the reply only shows until the next refresh.
      sendReply: (id, r) =>
        patchThread(id, (t) => ({
          ...t,
          messages: [
            ...t.messages,
            {
              id: crypto.randomUUID(),
              direction: "out",
              from: { name: "GeoServe Emissions", email: MAILBOX },
              to: r.to,
              cc: r.cc,
              at: new Date().toISOString(),
              body: r.body,
              sentBy: me.id,
              attachments: r.attachments.map((name) => ({ name, size: "—", kind: name.split(".").pop()!.toLowerCase() })),
            },
          ],
        })),
      alerts,
      alertForMe: (a) => a.roles.includes(me.role) || a.ownerId === me.id,
      updateAlert: (id, { status }) => {
        const a = alerts.find((x) => x.id === id)
        if (!a) return
        const snoozedUntil = status === "snoozed" ? tomorrow0930Ist() : undefined
        setAlertStates((s) => [...s.filter((x) => x.id !== id), { id, status, snoozedUntil }])
        persist(saveAlert(me.id, { id, title: a.title, href: a.href }, status, snoozedUntil))
      },
      txns,
      updateTxn: (id, { status }) => {
        if (status !== "confirmed") return
        setTxns((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)))
        persist(confirmTxn(me.id, id))
      },
      allocations,
      confirmAllocation: (id) => {
        setAllocations((as) => as.map((a) => (a.id === id ? { ...a, status: "confirmed", confirmedAt: new Date().toISOString() } : a)))
        persist(confirmAllocation(me.id, id))
      },
    }
  }, [workspace, me, users, allUsers, roles, orgs, vessels, threads, txns, allocations, alertStates])

  if (!value) return <SetupNeeded error={workspace.error} />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Shown instead of the app until the database is reachable and has at least one user. */
function SetupNeeded({ error }: { error?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-lg rounded-lg border bg-card p-6 text-[13px]">
        <h1 className="text-[17px] font-semibold text-foreground">{error ? "Database not reachable" : "No team members yet"}</h1>
        <p className="mt-2 text-muted-foreground">
          {error ?? "GeoEmissions needs at least one user. Add your team to the users table in Supabase (columns: name, email, role, initials, lead)."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Setup: run <code className="font-mono">geoemissions/supabase/schema.sql</code> in the Supabase SQL editor, and put SUPABASE_URL and
          SUPABASE_SERVICE_ROLE_KEY in the shared <code className="font-mono">.env</code>. This page checks again every time you reload.
        </p>
      </div>
    </main>
  )
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error("useStore outside StoreProvider")
  return s
}

/** Threads visible in a named inbox view for the current user. */
export function inView(t: Thread, view: string, meId: string) {
  switch (view) {
    case "mine":
      return t.assigneeId === meId && t.status !== "resolved"
    case "unassigned":
      return !t.assigneeId && t.status !== "resolved" && !t.duplicateOf
    case "review":
      return !!t.needsReview
    case "waiting":
      return t.status === "waiting_customer" || t.status === "waiting_internal"
    case "action":
      return t.status === "new" || t.status === "open"
    case "important":
      return !!t.important && t.status !== "resolved"
    case "resolved":
      return t.status === "resolved"
    default:
      return true
  }
}
