// Streams one attachment from the mailbox: inline images in emails, the PDF viewer, downloads (?download).
import { attachment } from "@/lib/graph"

export async function GET(req: Request, ctx: RouteContext<"/api/mail/[id]/attachments/[attachmentId]">) {
  const { id, attachmentId } = await ctx.params
  try {
    const a = await attachment(id, attachmentId)
    const pdf = a.contentType === "application/pdf" || /\.pdf$/i.test(a.name)
    const download = new URL(req.url).searchParams.has("download")
    return new Response(a.body.body, {
      headers: {
        "Content-Type": pdf ? "application/pdf" : a.contentType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
        "Cache-Control": "private, max-age=3600", // an attachment never changes under the same id
        "X-Content-Type-Options": "nosniff",
        // HTML/SVG attachments must not run script on this origin. Chrome refuses to show sandboxed PDFs, so PDFs are exempt.
        ...(!pdf && { "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" }),
      },
    })
  } catch (e) {
    const err = e as Error & { status?: number }
    return new Response(err.message, { status: err.status === 404 || err.status === 400 ? err.status : 502 })
  }
}
