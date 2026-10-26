// Supabase REST (PostgREST) access with the service-role key. Server only: the key never reaches the browser.
// Rows are snake_case in Postgres and camelCase in the app; nulls are dropped so optional fields read as undefined.
import "server-only"

const URL = process.env.SUPABASE_URL?.replace(/\/$/, "")
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const dbConfigured = !!(URL && KEY)

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())
const keys = (o: object, f: (k: string) => string, dropNull: boolean) =>
  Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (dropNull && v === null ? [] : [[f(k), v]])))

async function call(path: string, init: RequestInit = {}) {
  if (!dbConfigured) throw new Error("Database not connected: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...init.headers },
  }).catch((e) => {
    // "fetch failed" alone hides the reason (DNS, TLS, proxy); surface it.
    throw new Error(`Can't reach Supabase: ${e.cause?.code ?? ""} ${e.cause?.message ?? e.message}`.trim())
  })
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300)
    // PostgREST names missing tables/columns "… in the schema cache": the database predates a migration.
    const hint = text.includes("schema cache") ? " — run the latest file in geoemissions/supabase/migrations in the Supabase SQL editor" : ""
    throw new Error(`Supabase ${path.split("?")[0]}: ${r.status} ${text}${hint}`)
  }
  return r
}

/** GET rows. `query` is PostgREST syntax, e.g. "order=date.asc" or "imo=eq.9074729" (default columns: all). */
export async function select<T>(table: string, query = ""): Promise<T[]> {
  const q = query.startsWith("select=") ? query : `select=*${query ? "&" + query : ""}`
  const rows: object[] = await (await call(`${table}?${q}`)).json()
  return rows.map((r) => keys(r, camel, true) as T)
}

/** Insert, or update on primary-key conflict. */
export async function upsert(table: string, rows: object | object[]) {
  const body = (Array.isArray(rows) ? rows : [rows]).map((r) => keys(r, snake, false))
  await call(table, { method: "POST", body: JSON.stringify(body), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } })
}

/** PATCH rows matching a PostgREST filter, e.g. update("carbon_txns", "id=eq.CT-1", { status: "confirmed" }). */
export async function update(table: string, filter: string, patch: object) {
  await call(`${table}?${filter}`, { method: "PATCH", body: JSON.stringify(keys(patch, snake, false)), headers: { Prefer: "return=minimal" } })
}

/** DELETE rows matching a PostgREST filter, e.g. remove("templates", "id=eq.T-1"). */
export async function remove(table: string, filter: string) {
  await call(`${table}?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } })
}
