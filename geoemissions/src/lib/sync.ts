// Mailbox sync from the app: runs the same `outlook-pipeline.py sync` the pipeline loop runs (mail upserted by Graph id,
// so nothing is duplicated; vessel reports extracted; sync_status records the time or the error). Server only.
import { spawn } from "node:child_process" // node-only, so this never reaches the browser bundle
import path from "node:path"

let running: Promise<string | undefined> | undefined

/** Syncs once; resolves to the error message, or undefined once the mail is in. Vessel report extraction
 * then continues in the background (it records its own status). Concurrent callers share one run. */
export function syncMail() {
  if (running) return running
  // ponytail: newest 200 per folder, no paging; mail beyond that since the last sync is missed. Use Graph delta queries if volume grows.
  const p = spawn(process.env.PYTHON || "python", ["-u", "outlook-pipeline.py", "sync", "-n", "200", "--every", "0"], {
    cwd: path.join(process.cwd(), ".."),
    windowsHide: true,
  })
  const kill = setTimeout(() => p.kill(), 30 * 60_000) // a stalled Graph download must not hold the lock forever
  let stderr = ""
  p.stderr.on("data", (d) => (stderr += d))
  const result = new Promise<string | undefined>((resolve) => {
    p.stdout.on("data", (d) => /synced \d+ messages/.test(String(d)) && resolve(undefined))
    p.on("error", (e) => resolve(e.message)) // python not found
    p.on("close", (code) => resolve(code ? stderr.trim().split("\n").at(-1)?.replace(/^\[ERROR\]\s*/, "") || `Sync exited with code ${code}` : undefined))
  })
  running = result
  p.on("close", () => (clearTimeout(kill), (running = undefined)))
  p.on("error", () => (clearTimeout(kill), (running = undefined)))
  return result
}
