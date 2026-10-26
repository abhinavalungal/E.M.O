// Run: node --test src/lib/mail-html.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { emailDocument, listedAttachments, type MailAttachment } from "./mail-html.ts"

const att = (p: Partial<MailAttachment>): MailAttachment => ({ id: "x", name: "f", size: 1, isInline: true, contentType: "image/png", ...p })
const url = (a: MailAttachment) => `/api/mail/m1/attachments/${a.id}`

test("cid: references resolve to their attachment, by content-id or by file name; missing ones become a blank pixel", () => {
  const atts = [
    att({ id: "logo", name: "image005.png", contentId: "<image005.png@01DD5C9D.C7BB88C0>" }),
    att({ id: "byname", name: "image009.jpg", contentId: undefined, contentType: "image/jpeg" }),
    att({ id: "pdf", name: "a.pdf", contentId: "doc@x", contentType: "application/pdf" }),
  ]
  const doc = emailDocument(
    `<p>Hi</p><img src="cid:image005.png@01DD5C9D.C7BB88C0" width="120"><img src='cid:image009.jpg@01DC0000.00000000'><img src="cid:gone@x"><img src="cid:doc@x"><td background="cid:IMAGE005.PNG@01DD5C9D.C7BB88C0">`,
    atts,
    url,
  )
  assert.match(doc, /<img src="\/api\/mail\/m1\/attachments\/logo" width="120">/)
  assert.match(doc, /<img src='\/api\/mail\/m1\/attachments\/byname'>/)
  assert.equal((doc.match(/data:image\/gif/g) ?? []).length, 2) // missing + non-image reference
  assert.match(doc, /background="\/api\/mail\/m1\/attachments\/logo"/) // case-insensitive, any attribute
  assert.doesNotMatch(doc, /cid:/)
})

test("scripts, event handlers, meta refresh and foreign <base> are removed; links open in a new tab", () => {
  const doc = emailDocument(
    `<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><script>alert(1)</script><a href="https://geoserves.com" onclick="steal()">site</a><img src=x onerror=alert(1)>`,
    [],
    url,
  )
  assert.doesNotMatch(doc, /script|onclick|onerror|evil\.example/)
  assert.match(doc, /<base target="_blank">/)
  assert.match(doc, /<a href="https:\/\/geoserves\.com">site<\/a>/) // links and formatting kept
})

test("listed attachments exclude inline images and anything the body references", () => {
  const atts = [att({ id: "1", isInline: true }), att({ id: "2", isInline: false, contentId: "sig@1" }), att({ id: "3", isInline: false, name: "BDN.pdf" })]
  assert.deepEqual(listedAttachments(atts, "<img src='cid:sig@1'>").map((a) => a.id), ["3"])
  assert.deepEqual(listedAttachments(atts, "no images").map((a) => a.id), ["2", "3"])
})
