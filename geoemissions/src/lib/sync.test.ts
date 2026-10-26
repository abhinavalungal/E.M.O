// Run: node --test src/lib/sync.test.ts
// Runs syncMail against a stand-in outlook-pipeline.py in a temp folder, with the real Python.
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { syncMail } from "./sync.ts"

function pipeline(script: string) {
  const root = mkdtempSync(path.join(tmpdir(), "pipeline-"))
  mkdirSync(path.join(root, "app"))
  writeFileSync(path.join(root, "outlook-pipeline.py"), script)
  process.chdir(path.join(root, "app")) // the app runs from geoemissions/, the pipeline sits one folder up
}

test("a sync that fails before the mail is in resolves to the pipeline's error", async () => {
  pipeline(`import sys\nprint("[ERROR] Graph sign-in failed: invalid_client", file=sys.stderr)\nsys.exit(1)\n`)
  assert.equal(await syncMail(), "Graph sign-in failed: invalid_client")
})

test("sync resolves once the mail is in, while vessel reports keep extracting in the background", async () => {
  pipeline(`import time\nprint("2026-10-22T12:00:00  synced 3 messages", flush=True)\ntime.sleep(4)\n`)
  const first = syncMail()
  assert.equal(syncMail(), first) // one run at a time
  assert.equal(await first, undefined)
  assert.equal(syncMail(), first) // resolved, yet the process is still running: report extraction holds the lock
})
