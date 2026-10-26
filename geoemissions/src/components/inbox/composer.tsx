"use client"

import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { toast } from "sonner"
import { Eye, FileText, Lock, Paperclip, PenLine, RefreshCw, Send, Sparkles, StickyNote, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAILBOX } from "@/lib/data"
import { useStore } from "@/lib/store"
import { fillTemplate, templatesFor, templateValues, unfilled } from "@/lib/templates"
import type { Thread } from "@/lib/types"
import { TemplateText } from "../templates"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Mode = "reply" | "reply_all" | "forward" | "note"
export type ComposerHandle = { open: (mode: Mode, draftWithAi?: boolean) => void }

const MODES: { id: Mode; label: string }[] = [
  { id: "reply", label: "Reply" },
  { id: "reply_all", label: "Reply all" },
  { id: "forward", label: "Forward" },
  { id: "note", label: "Internal note" },
]

function recipients(t: Thread, mode: Mode) {
  const lastIn = [...t.messages].reverse().find((m) => m.direction === "in")
  const primary = lastIn?.from.email ?? t.messages[0].to[0]
  if (mode === "forward") return { to: "", cc: "" }
  if (mode === "reply") return { to: primary, cc: "" }
  const cc = [...new Set(t.messages.flatMap((m) => [...m.to, ...(m.cc ?? [])]))].filter((e) => e !== primary && e.toLowerCase() !== MAILBOX.toLowerCase())
  return { to: primary, cc: cc.join(", ") }
}

function aiDraft(t: Thread, variant: number, vessel?: { name: string }) {
  if (variant % 2 === 0 && t.intel.suggestedReply) return t.intel.suggestedReply
  const name = [...t.messages].reverse().find((m) => m.direction === "in")?.from.name.split(" ")[0] ?? "team"
  return `Dear ${name},\n\nThank you for your email${vessel ? ` regarding ${vessel.name}` : ""}. ${t.intel.action?.replace(/\.$/, "") ?? "We are looking into this"} — we will confirm shortly.\n\nBest regards,`
}

export const Composer = forwardRef<ComposerHandle, { thread: Thread }>(function Composer({ thread: t }, ref) {
  const { sendReply, addNote, me, templates, orgById, vesselByImo, userById } = useStore()
  const vessel = vesselByImo(t.vesselImos[0])
  const [mode, setMode] = useState<Mode | null>(null)
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [body, setBody] = useState("")
  const [files, setFiles] = useState<string[]>([])
  const [ai, setAi] = useState<{ variant: number } | null>(null)
  const [preview, setPreview] = useState(false)
  const mine = templatesFor(templates, me)
  const todo = unfilled(body)
  const signature = me.signature ?? `${me.name}\nGeoServe Emissions Team · ${MAILBOX}`
  const fileInput = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const open = (m: Mode, draftWithAi = false) => {
    const r = recipients(t, m)
    setMode(m)
    setTo(r.to)
    setCc(r.cc)
    setShowCc(!!r.cc)
    setFiles(m === "forward" ? t.messages.flatMap((x) => x.attachments?.map((a) => a.name) ?? []) : [])
    if (draftWithAi && m !== "note") {
      setBody(aiDraft(t, 0, vessel))
      setAi({ variant: 0 })
    } else {
      setBody("")
      setAi(null)
    }
    setPreview(false)
    requestAnimationFrame(() => textarea.current?.focus())
  }
  useImperativeHandle(ref, () => ({ open }))

  const reset = () => {
    setMode(null)
    setPreview(false)
    setBody("")
    setAi(null)
    setFiles([])
  }

  const send = () => {
    if (mode === "note") {
      addNote(t.id, body)
      toast.success("Internal note added", { description: "Visible to the team only — never sent to the customer." })
      return reset()
    }
    if (!to.trim()) return toast.error("Add at least one recipient")
    if (todo.length) {
      setPreview(true)
      return toast.error("Fill in the placeholders first", { description: todo.join(", ") })
    }
    const payload = {
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      cc: cc.split(",").map((s) => s.trim()).filter(Boolean),
      body,
      attachments: files,
    }
    reset()
    // ponytail: 5s client-side undo window; the real build holds the Graph send job server-side.
    let undone = false
    const timer = setTimeout(() => {
      if (undone) return
      sendReply(t.id, payload)
      toast.warning("Not sent — reply from Outlook", { description: "Sending from the app isn't wired yet; this reply is kept here only." })
    }, 5000)
    toast(`Saving reply to ${payload.to[0]}…`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true
          clearTimeout(timer)
          toast.info("Send cancelled — draft discarded")
        },
      },
    })
  }

  if (!mode)
    return (
      <div className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3">
        <Button size="sm" onClick={() => open("reply")}>
          Reply
        </Button>
        <Button size="sm" variant="outline" onClick={() => open("reply_all")}>
          Reply all
        </Button>
        <Button size="sm" variant="outline" onClick={() => open("forward")}>
          Forward
        </Button>
        <Button size="sm" variant="outline" onClick={() => open("note")}>
          <StickyNote /> Note
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-sky" onClick={() => open("reply", true)}>
          <Sparkles /> Draft reply with AI
        </Button>
      </div>
    )

  const isNote = mode === "note"
  return (
    <div className={cn("max-h-[65%] overflow-y-auto border-t", isNote ? "bg-note" : "bg-card")}>
      <div className="flex items-center gap-1 border-b px-3 pt-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => open(m.id)}
            className={cn(
              "-mb-px border-b-2 px-2.5 pb-2 text-[13px] font-medium transition-colors",
              mode === m.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
        <Button variant="ghost" size="icon-xs" className="mb-1.5 ml-auto" onClick={reset} aria-label="Close composer">
          <X />
        </Button>
      </div>

      {isNote ? (
        <p className="flex items-center gap-1.5 px-4 pt-2 text-xs text-warn">
          <Lock className="size-3" /> Internal note — visible to the GeoServe team only. Use @name to mention.
        </p>
      ) : (
        <div className="space-y-1 px-4 pt-2 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="w-10 text-muted-foreground">From</span>
            <span className="font-medium">{MAILBOX}</span>
            <span className="text-xs text-muted-foreground">· sent by {me.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-10 text-muted-foreground" htmlFor="to">
              To
            </label>
            <input id="to" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 flex-1 bg-transparent outline-none" placeholder="name@company.com" />
            {!showCc && (
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)}>
                Cc / Bcc
              </button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <label className="w-10 text-muted-foreground" htmlFor="cc">
                Cc
              </label>
              <input id="cc" value={cc} onChange={(e) => setCc(e.target.value)} className="h-7 flex-1 bg-transparent outline-none" />
            </div>
          )}
        </div>
      )}

      {ai && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-sky/20 bg-sky-soft px-2.5 py-1.5 text-xs text-info">
          <Sparkles className="size-3.5" />
          <span>AI draft from the thread, linked vessel data and past replies — review before sending.</span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-info"
            onClick={() => {
              const v = ai.variant + 1
              setAi({ variant: v })
              setBody(aiDraft(t, v, vessel))
            }}
          >
            <RefreshCw /> Regenerate
          </Button>
        </div>
      )}

      {preview && !isNote ? (
        <div className="mx-4 mt-2 rounded-md border bg-background p-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            To {to || "—"}
            {cc && ` · Cc ${cc}`} · from {MAILBOX}
          </p>
          {todo.length > 0 && (
            <p className="mb-2 flex items-center gap-1.5 rounded bg-warn-soft px-2 py-1 text-xs text-warn">
              <TriangleAlert className="size-3.5 shrink-0" /> Still to fill: {todo.join(", ")}
            </p>
          )}
          <TemplateText body={body} />
          <p className="mt-3 border-t border-dashed pt-2 text-xs whitespace-pre-line text-muted-foreground">{signature}</p>
        </div>
      ) : (
        <div className="px-4 pt-2">
          <Textarea
            ref={textarea}
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              if (ai) setAi(null)
            }}
            rows={isNote ? 3 : 7}
            placeholder={isNote ? "Add a note for the team…" : "Write your reply…"}
            className={cn("resize-y border-0 bg-transparent px-0 text-[13px] leading-relaxed shadow-none focus-visible:ring-0", isNote && "bg-transparent")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) send()
            }}
          />
          {!isNote && (
            <p className="border-t border-dashed pt-2 pb-1 text-xs whitespace-pre-line text-muted-foreground">
              {signature}
            </p>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {files.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-xs">
              <FileText className="size-3.5 text-muted-foreground" /> {f}
              <button onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${f}`}>
                <X className="size-3 text-muted-foreground" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button size="sm" onClick={send} disabled={!body.trim()} className={isNote ? "bg-warn hover:bg-warn/85" : undefined}>
          {isNote ? <StickyNote /> : <Send />} {isNote ? "Add note" : "Send"}
        </Button>
        {!isNote && (
          <>
            <Button size="sm" variant="outline" onClick={() => setPreview(!preview)} disabled={!body.trim()}>
              {preview ? <PenLine /> : <Eye />} {preview ? "Edit" : "Preview"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? []).map((f) => f.name)])}
            />
            <Button size="icon-sm" variant="ghost" onClick={() => fileInput.current?.click()} aria-label="Attach files">
              <Paperclip />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  <FileText /> Templates
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Insert template</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {mine.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No templates yet — create them in Profile → My templates.</p>}
                {mine.map((tp, i) => (
                  <div key={tp.id}>
                    {(i === 0 || !!mine[i - 1].ownerId !== !!tp.ownerId) && (
                      <DropdownMenuLabel className="pt-1 text-[11px] font-normal text-muted-foreground">{tp.ownerId ? "My templates" : "Shared"}</DropdownMenuLabel>
                    )}
                    <DropdownMenuItem
                      onSelect={() => {
                        setBody(fillTemplate(tp.body, templateValues(t, { vessel, customer: orgById(t.customerId), pic: userById(t.assigneeId) ?? me, me })))
                        setAi(null)
                        setPreview(true) // show the filled email, with anything left to fill marked
                      }}
                    >
                      {tp.name}
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {!ai && (
              <Button size="sm" variant="ghost" className="text-sky" onClick={() => (setBody(aiDraft(t, 0, vessel)), setAi({ variant: 0 }))}>
                <Sparkles /> AI draft
              </Button>
            )}
          </>
        )}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
          {isNote ? "Ctrl+Enter to add" : `Ctrl+Enter to send · replying to ${orgById(t.orgId)?.short ?? "sender"}`}
        </span>
      </div>
    </div>
  )
})
