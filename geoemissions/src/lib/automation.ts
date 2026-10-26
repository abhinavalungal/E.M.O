// Background work that runs after page loads (the app re-reads every 30 s while open), so no extra process is needed:
// the hourly mailbox sync, and moving unanswered mail to backups under the admin's escalation policy. Server only.
import "server-only"
import { SYNC_EVERY_MS } from "./data"
import { upsert } from "./db"
import { syncMail } from "./sync"
import { planEscalations } from "./team"
import type { Workspace } from "./workspace"

let lastAutoSync = 0
let escalating = false

export async function runAutomation(ws: Workspace) {
  if (ws.error) return
  const now = ws.loadedAt
  const due = !ws.sync.syncedAt || now - Date.parse(ws.sync.syncedAt) >= SYNC_EVERY_MS
  if (due && now - lastAutoSync > 10 * 60_000) {
    lastAutoSync = now // a failing sync retries every 10 minutes, not on every refresh
    void syncMail()
  }

  if (escalating) return
  escalating = true
  try {
    const name = (id: string) => ws.users.find((u) => u.id === id)?.name ?? id
    for (const e of planEscalations(ws.threads, ws.users, ws.policy, now)) {
      const at = new Date().toISOString()
      await upsert("thread_state", { id: e.threadId, assigneeId: e.to, originalAssigneeId: e.original, escalatedAt: at, updatedAt: at })
      await upsert("activity", { actorId: "system", action: `reassigned from ${name(e.from)} to ${name(e.to)} (${e.reason}):`, target: e.subject, href: `/inbox?view=all&t=${encodeURIComponent(e.threadId)}` })
    }
  } catch (e) {
    console.error("Escalation failed:", e) // retried on the next page load
  } finally {
    escalating = false
  }
}
