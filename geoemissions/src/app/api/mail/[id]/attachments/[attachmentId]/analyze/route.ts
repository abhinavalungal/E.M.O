// Summary + structured data for one attachment (rule-based, OCR for scans). Cached per attachment: ids never change.
import { attachment } from "@/lib/graph"
import { processDocument, type DocumentResult } from "@/lib/documents"

const cache = new Map<string, Promise<DocumentResult>>() // ponytail: in-memory, last 50; lost on restart, which is fine
const MAX_BYTES = 25 * 1024 * 1024

export async function GET(_req: Request, ctx: RouteContext<"/api/mail/[id]/attachments/[attachmentId]/analyze">) {
  const { id, attachmentId } = await ctx.params
  const key = `${id}/${attachmentId}`
  try {
    let job = cache.get(key)
    if (!job) {
      job = attachment(id, attachmentId).then(async (a) => {
        if (a.size > MAX_BYTES) throw Object.assign(new Error(`${a.name} is larger than 25 MB.`), { status: 413 })
        return processDocument(new Uint8Array(await a.body.arrayBuffer()), a.name, a.contentType)
      })
      cache.set(key, job)
      job.catch(() => cache.delete(key)) // failures are retried on the next request
      if (cache.size > 50) cache.delete(cache.keys().next().value!)
    }
    return Response.json(await job, { headers: { "Cache-Control": "private, max-age=3600" } })
  } catch (e) {
    const err = e as Error & { status?: number }
    return Response.json({ error: err.message }, { status: [400, 404, 413, 415].includes(err.status ?? 0) ? err.status : 502 })
  }
}
