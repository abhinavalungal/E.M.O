// The message as the sender wrote it (HTML), with inline images resolved, for the inbox's sandboxed viewer.
import { graph, graphId } from "@/lib/graph"
import { emailDocument, listedAttachments, type MailAttachment } from "@/lib/mail-html"

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

export async function GET(_req: Request, ctx: RouteContext<"/api/mail/[id]">) {
  const { id } = await ctx.params
  try {
    const m = await (
      await graph(`/messages/${graphId(id)}?$select=body&$expand=attachments($select=id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId)`)
    ).json()
    const atts: MailAttachment[] = m.attachments ?? []
    const html: string = m.body?.contentType === "html" ? m.body.content : `<pre>${escapeHtml(m.body?.content ?? "")}</pre>`
    const url = (a: MailAttachment) => `/api/mail/${encodeURIComponent(id)}/attachments/${encodeURIComponent(a.id)}`
    return Response.json(
      {
        html: emailDocument(html, atts, url),
        attachments: listedAttachments(atts, html).map(({ id, name, size, contentType }) => ({ id, name, size, contentType })),
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    )
  } catch (e) {
    const err = e as Error & { status?: number }
    return Response.json({ error: err.message }, { status: err.status === 404 || err.status === 400 ? err.status : 502 })
  }
}
