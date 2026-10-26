// Microsoft Graph, app-only (client credentials), for the one mailbox the pipeline syncs. Server only.
// Used for what is too heavy to copy into Supabase every 30 s: HTML bodies and attachment bytes, fetched on demand.
import "server-only"

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, MAILBOX } = process.env
let token: { value: string; expires: number } | undefined

async function bearer(force = false) {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !MAILBOX) throw new Error("Mailbox not connected: set TENANT_ID, CLIENT_ID, CLIENT_SECRET and MAILBOX in .env")
  if (!force && token && token.expires > Date.now() + 60_000) return token.value
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`Graph sign-in failed: ${j.error_description ?? j.error ?? r.status}`)
  token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 }
  return token.value
}

// Graph allows ~4 concurrent requests per mailbox per app (429 "MailboxConcurrency"); an email with 20 inline images
// would exceed it, so requests queue for one of 4 slots, and throttled ones are retried after Retry-After.
const SLOTS = 4
let active = 0
const waiting: (() => void)[] = []
const acquire = () => (active < SLOTS ? (active++, Promise.resolve()) : new Promise<void>((r) => waiting.push(r)))
const release = () => (waiting.length ? waiting.shift()!() : active--) // hand the slot straight to the next in line

/** GET a path under /users/{MAILBOX}, e.g. graph(`/messages/${id}`). Throws on any non-2xx with Graph's message. */
export async function graph(path: string): Promise<Response> {
  let force = false
  for (let attempt = 0; attempt < 5; attempt++) {
    await acquire()
    let r: Response
    try {
      r = await fetch(`https://graph.microsoft.com/v1.0/users/${MAILBOX}${path}`, { headers: { Authorization: `Bearer ${await bearer(force)}` }, cache: "no-store" })
    } finally {
      release()
    }
    if (r.status === 401 && !force) {
      force = true
      continue
    }
    if ([429, 503, 504].includes(r.status) && attempt < 4) {
      const wait = Number(r.headers.get("Retry-After")) || 2 ** attempt
      await new Promise((ok) => setTimeout(ok, Math.min(wait, 10) * 1000))
      continue
    }
    if (!r.ok) throw Object.assign(new Error(`Graph ${r.status}: ${(await r.text()).slice(0, 300)}`), { status: r.status })
    return r
  }
  throw new Error("Graph: retries exhausted")
}

/** One attachment's name, type and bytes (as a streaming Response). */
export async function attachment(messageId: string, attachmentId: string) {
  const base = `/messages/${graphId(messageId)}/attachments/${graphId(attachmentId)}`
  const [meta, body] = await Promise.all([graph(`${base}?$select=name,contentType,size`).then((r) => r.json()), graph(`${base}/$value`)])
  return { name: String(meta.name ?? "attachment"), contentType: String(meta.contentType || "application/octet-stream"), size: Number(meta.size ?? 0), body }
}

/** A Graph id as a URL path segment. Ids are opaque base64-ish strings; anything else is rejected. */
export function graphId(id: string) {
  if (!/^[A-Za-z0-9_=+\/-]{1,512}$/.test(id)) throw Object.assign(new Error("Bad id"), { status: 400 })
  return encodeURIComponent(id)
}
