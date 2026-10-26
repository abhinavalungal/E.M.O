// Email HTML as the inbox shows it: inline images (cid: references) pointed at their MIME attachments,
// rendered inside a sandboxed iframe (no scripts, no forms, links open in a new tab).

export type MailAttachment = { id: string; name: string; contentType?: string; size: number; isInline: boolean; contentId?: string }

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" // 1×1 transparent
const cidKey = (s: string) => decodeURIComponent(s).replace(/^<|>$/g, "").toLowerCase()

/** Content-ids referenced by a body: `cid:x` in HTML, `[cid:x]` in Outlook's plain-text rendering. */
export function referencedCids(body: string) {
  return new Set([...body.matchAll(/cid:([^"'\s)>\]]+)/gi)].map((m) => cidKey(m[1])))
}

/** Attachments to list under a message: real files only, not images already shown in the body.
 * Without the body (the inbox list doesn't load bodies), an image with a content-id counts as shown in it. */
export function listedAttachments<T extends { isInline: boolean; contentId?: string; contentType?: string }>(atts: T[], body?: string) {
  const used = body === undefined ? undefined : referencedCids(body)
  return atts.filter((a) => !a.isInline && !(a.contentId && (used ? used.has(cidKey(a.contentId)) : a.contentType?.startsWith("image/"))))
}

/** A complete document for <iframe srcdoc>. `url(a)` is where the browser can fetch attachment `a`. */
export function emailDocument(html: string, atts: MailAttachment[], url: (a: MailAttachment) => string) {
  const byCid = new Map(atts.filter((a) => a.contentId).map((a) => [cidKey(a.contentId!), a]))
  // Some senders reference by file name ("cid:image001.png@01DC..." where only the name matches).
  const byName = new Map(atts.map((a) => [a.name.toLowerCase(), a]))
  const resolve = (ref: string) => {
    const a = byCid.get(cidKey(ref)) ?? byName.get(cidKey(ref).split("@")[0])
    return a && (a.contentType ?? "image/").startsWith("image/") ? url(a) : BLANK // missing / non-image: keep layout, no broken icon
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(meta[^>]+http-equiv|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "") // defence in depth; the sandbox already blocks scripts
    .replace(/cid:([^"'\s)>]+)/gi, (_, ref: string) => resolve(ref))
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="color-scheme" content="light">
<style>html,body{margin:0;padding:0;background:#fff;color:#1f2328}body{font:13px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>
</head><body>${body}</body></html>`
}
