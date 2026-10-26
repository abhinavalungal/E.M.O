"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlarmClock,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Eye,
  Lock,
  MoreHorizontal,
  PanelRight,
  Sparkles,
  Star,
  UserPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORIES, MAILBOX } from "@/lib/data"
import { fmtDateTime, fmtListTime } from "@/lib/format"
import { useStore } from "@/lib/store"
import { coverFor, isAway } from "@/lib/team"
import type { Attachment, Message, Note, Priority, Status, Thread } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CategoryChip, FileIcon, PRIORITY_LABEL, PriorityIcon, STATUS, StatusPill, UserAvatar } from "../pills"
import { Composer, type ComposerHandle } from "./composer"
import { ANALYZABLE, DocumentViewer, type ViewerFile } from "./document-viewer"

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
}

type Body = { html?: string; attachments?: { id: string; name: string; size: number }[]; error?: string }
const kb = (n: number) => (n < 1_048_576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)

/** The original HTML email (images, signatures, layout) in a sandboxed frame; the preview text until it loads or if it can't. */
function EmailBody({ m, body }: { m: Message; body?: Body }) {
  const [height, setHeight] = useState(0)
  if (!body?.html)
    return (
      <div className="px-4 pt-3 pb-4 pl-15">
        <div className="text-[13px] leading-relaxed whitespace-pre-line text-foreground/90">{m.body}</div>
        {body?.error && <p className="mt-2 text-[11px] text-muted-foreground">Showing a preview — the full email couldn&apos;t be loaded ({body.error.slice(0, 120)}).</p>}
      </div>
    )
  return (
    <div className="px-4 pt-3 pb-4 pl-15">
      <iframe
        title={`Email from ${m.from.name}`}
        srcDoc={body.html}
        // No allow-scripts: the email can't run code. allow-same-origin only lets us measure its height.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="w-full rounded-md border-0 bg-white"
        style={{ height: height || 160 }}
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument
          if (!doc) return
          const fit = () => setHeight(doc.documentElement.scrollHeight)
          fit()
          new ResizeObserver(fit).observe(doc.body) // images arriving later grow the email
        }}
      />
    </div>
  )
}

function MessageCard({ m, collapsed, onExpand, onOpenFile }: { m: Message; collapsed: boolean; onExpand: () => void; onOpenFile: (f: ViewerFile) => void }) {
  const out = m.direction === "out"
  const { userById } = useStore()
  const sender = out ? userById(m.sentBy) : undefined
  const [body, setBody] = useState<Body>()
  const local = !!m.sentBy // a reply typed here: not in Outlook yet
  useEffect(() => {
    if (collapsed || local || body) return
    let live = true
    fetch(`/api/mail/${encodeURIComponent(m.id)}`)
      .then(async (r) => (r.ok ? r.json() : { error: (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}` }))
      .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
      .then((b) => live && setBody(b))
    return () => {
      live = false
    }
  }, [collapsed, local, body, m.id])
  // Graph's list has attachment ids (also for mail synced before ids were stored); fall back to the synced list.
  const files: Attachment[] | undefined = body?.attachments?.map((a) => ({ id: a.id, name: a.name, size: kb(a.size), kind: a.name.split(".").pop()!.toLowerCase() })) ?? m.attachments
  return (
    <article
      className={cn(
        "rounded-lg border bg-card",
        out && "border-brand/15",
        collapsed && "cursor-pointer hover:border-foreground/15",
      )}
      onClick={collapsed ? onExpand : undefined}
    >
      <header className="flex items-start gap-3 px-4 pt-3.5">
        {out ? (
          <UserAvatar userId={m.sentBy} size="md" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/70">
            {initials(m.from.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-semibold text-foreground">{out ? `${sender?.name ?? "GeoServe"} via Geoemissions` : m.from.name}</span>
            <span className="truncate text-xs text-muted-foreground">{m.from.email}</span>
          </div>
          {!collapsed && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              To {m.to.join(", ")}
              {m.cc?.length ? ` · Cc ${m.cc.join(", ")}` : ""}
            </p>
          )}
        </div>
        <time className="shrink-0 text-xs text-muted-foreground" title={fmtDateTime(m.at)}>
          {fmtListTime(m.at)}
        </time>
      </header>
      {collapsed ? (
        <p className="truncate px-4 pt-1 pb-3.5 pl-15 text-[13px] text-muted-foreground">{m.body.replace(/\n+/g, " ")}</p>
      ) : (
        <>
          {local ? <div className="px-4 pt-3 pb-4 pl-15 text-[13px] leading-relaxed whitespace-pre-line text-foreground/90">{m.body}</div> : <EmailBody m={m} body={body} />}
          {!!files?.length && (
            <div className="flex flex-wrap gap-2 px-4 pb-4 pl-15">
              {files.map((a, i) => (
                <button
                  key={a.name + i}
                  disabled={!a.id}
                  title={!a.id ? "Loading…" : ANALYZABLE.test(a.name) ? "Open · Summarize · Extract data" : "Download"}
                  onClick={() => {
                    if (!a.id) return
                    if (ANALYZABLE.test(a.name)) onOpenFile({ messageId: m.id, id: a.id, name: a.name })
                    else window.open(`/api/mail/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(a.id)}?download`, "_blank", "noopener")
                  }}
                  className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors hover:border-foreground/20 disabled:opacity-60"
                >
                  <FileIcon kind={a.kind} />
                  <span>
                    <span className="block max-w-[220px] truncate text-xs font-medium">{a.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {a.size}
                      {a.scanned && " · scanned, OCR extracted"}
                      {a.duplicateOf && " · duplicate file"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  )
}

function NoteCard({ n }: { n: Note }) {
  const author = useStore().userById(n.authorId)
  return (
    <div className="flex gap-3 rounded-lg border border-[#f3dfa2] bg-note px-4 py-3">
      <UserAvatar userId={n.authorId} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">{author?.name}</span>
          <span className="flex items-center gap-1 text-warn">
            <Lock className="size-3" /> Internal note
          </span>
          <span className="ml-auto text-muted-foreground">{fmtListTime(n.at)}</span>
        </div>
        <p className="mt-1 text-[13px] whitespace-pre-line text-foreground/90">
          {n.body.split(/(@\w+)/g).map((part, i) =>
            part.startsWith("@") ? (
              <span key={i} className="rounded bg-sky-soft px-0.5 font-medium text-info">
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </p>
      </div>
    </div>
  )
}

export function ThreadView({
  thread: t,
  backHref,
  onTogglePanel,
  composerRef,
}: {
  thread: Thread
  backHref: string
  onTogglePanel: () => void
  composerRef: React.RefObject<ComposerHandle | null>
}) {
  const { updateThread, me, users, allUsers, orgById, userById, vesselByImo, can } = useStore()
  const assignee = userById(t.assigneeId)
  const cover = coverFor(t.assigneeId, allUsers)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [file, setFile] = useState<ViewerFile>()
  const scroller = useRef<HTMLDivElement>(null)
  const org = orgById(t.orgId)

  useEffect(() => {
    if (t.unread) updateThread(t.id, { unread: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id])

  // Show a just-sent reply or note
  const itemCount = t.messages.length + t.notes.length
  useEffect(() => {
    if (itemCount > 1) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [itemCount])

  const timeline = [
    ...t.messages.map((m) => ({ kind: "m" as const, at: m.at, m })),
    ...t.notes.map((n) => ({ kind: "n" as const, at: n.at, n })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  const lastMsgId = t.messages[t.messages.length - 1].id

  const setStatus = (status: Status) => {
    updateThread(t.id, { status })
    toast.success(`Marked ${STATUS[status].label.toLowerCase()}`)
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="shrink-0 border-b bg-card px-4 pt-3 pb-3 md:px-5">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon-sm" asChild className="-ml-1 md:hidden">
            <Link href={backHref} scroll={false} aria-label="Back to list">
              <ArrowLeft />
            </Link>
          </Button>
          <h2 className="min-w-0 flex-1 text-[17px] leading-snug font-semibold tracking-tight text-foreground">{t.subject}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => updateThread(t.id, { important: !t.important })}
            aria-label={t.important ? "Unmark important" : "Mark important"}
            title="Important (i)"
          >
            <Star className={cn(t.important && "fill-[#fab219] text-[#fab219]")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onTogglePanel} aria-label="Toggle intelligence panel" className="min-[1440px]:hidden">
            <PanelRight />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {t.labels.slice(0, 2).map((l) => (
            <CategoryChip key={l.category} category={l.category} />
          ))}
          {t.vesselImos.map((imo) => (
            <Link key={imo} href={`/vessels/${imo}`} className="inline-flex h-5 items-center rounded-md bg-brand-soft px-1.5 text-[11px] font-medium text-brand hover:underline">
              {vesselByImo(imo)?.name ?? `IMO ${imo}`}
            </Link>
          ))}
          {org && <span className="text-xs text-muted-foreground">· {org.name}</span>}
          {t.viewers?.map((v) => (
            <span key={v} className="ml-auto flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2 pl-0.5 text-[11px] text-muted-foreground">
              <UserAvatar userId={v} size="xs" />
              <Eye className="size-3" /> {userById(v)?.name.split(" ")[0]} is viewing
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <StatusPill status={t.status} />
              <ChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
              {(Object.keys(STATUS) as Status[]).map((s) => {
                const S = STATUS[s]
                return (
                  <DropdownMenuItem key={s} onSelect={() => setStatus(s)}>
                    <S.icon /> {S.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs">
                <UserAvatar userId={t.assigneeId} size="xs" className="-ml-0.5" />
                {userById(t.assigneeId)?.name ?? "Assign"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onSelect={() => {
                  updateThread(t.id, { assigneeId: me.id })
                  toast.success("Assigned to you")
                }}
              >
                <UserPlus /> Assign to me
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {can("thread.assign") &&
                users.map((u) => (
                  <DropdownMenuItem
                    key={u.id}
                    onSelect={() => {
                      updateThread(t.id, { assigneeId: u.id })
                      toast.success(`Assigned to ${u.name}`, { description: "It's in their queue now." })
                    }}
                  >
                    <UserAvatar userId={u.id} size="xs" /> {u.name}
                    {isAway(u) && <span className="ml-auto text-[11px] text-warn">away</span>}
                  </DropdownMenuItem>
                ))}
              {can("thread.assign") && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => updateThread(t.id, { assigneeId: undefined })}>Unassign</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {assignee && cover?.id !== assignee.id && (
            <span className="text-[11px] text-warn">
              {assignee.name} is away{cover ? ` · ${cover.name} covering` : " · no backup available"}
            </span>
          )}
          {t.originalAssigneeId && t.originalAssigneeId !== t.assigneeId && (
            <span className="text-[11px] text-muted-foreground">Originally {userById(t.originalAssigneeId)?.name}</span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs">
                <PriorityIcon priority={t.priority} /> {PRIORITY_LABEL[t.priority]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <DropdownMenuItem key={p} onSelect={() => updateThread(t.id, { priority: p })}>
                  <PriorityIcon priority={p} /> {PRIORITY_LABEL[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs">
                <AlarmClock /> Snooze
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {["Later today (16:00)", "Tomorrow 09:30", "Monday 09:30", "Until customer replies"].map((s) => (
                <DropdownMenuItem key={s} onSelect={() => toast(`Snoozed · ${s}`, { description: "It will return to the queue automatically." })}>
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1.5">
            {t.status !== "resolved" ? (
              <Button size="xs" onClick={() => setStatus("resolved")} title="Resolve (e)">
                <Check /> Resolve
              </Button>
            ) : (
              <Button size="xs" variant="outline" onClick={() => setStatus("open")}>
                Reopen
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => composerRef.current?.open("forward")}>Forward</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast("Linked to vessel", { description: "Pick a vessel in the full build." })}>Link to vessel…</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast("Open in Outlook", { description: `Opens the message in ${MAILBOX} (Outlook on the web).` })}>
                  Open in Outlook
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(`${location.origin}/inbox?view=all&t=${t.id}`)
                    toast.success("Link copied")
                  }}
                >
                  <Copy /> Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    updateThread(t.id, { labels: [{ category: "other", confidence: 1, source: "human" }], status: "resolved" })
                    toast("Marked not relevant", { description: "Filed as Other and resolved." })
                  }}
                >
                  Not relevant
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4 md:px-5">
        {t.needsReview && (
          <div className="rounded-lg border border-warn/25 bg-warn-soft p-3.5">
            <p className="text-[13px] font-medium text-warn">Classification needs review</p>
            <p className="mt-0.5 text-xs text-foreground/75">
              Best guess is {Math.round(t.labels[0].confidence * 100)}% confident. Pick the right category — it is saved for this conversation.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {t.labels.map((l) => (
                <Button
                  key={l.category}
                  size="xs"
                  variant="outline"
                  className="bg-card"
                  onClick={() => {
                    updateThread(t.id, { needsReview: false, labels: [{ ...l, confidence: 1, source: "human" }, ...t.labels.filter((x) => x !== l)] })
                    toast.success(`Classified as ${CATEGORIES[l.category].label}`)
                  }}
                >
                  {CATEGORIES[l.category].label} · {Math.round(l.confidence * 100)}%
                </Button>
              ))}
            </div>
          </div>
        )}

        {t.duplicateOf && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2.5 text-[13px]">
            <Copy className="size-4 text-muted-foreground" />
            <span className="text-foreground/80">Duplicate — the attachment is identical to one already received.</span>
            <Link href={`/inbox?view=all&t=${t.duplicateOf}`} scroll={false} className="ml-auto text-xs font-medium text-sky hover:underline">
              Open original
            </Link>
          </div>
        )}

        {t.intel.action && (
          <div className="rounded-lg border border-l-2 border-l-sky bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-info">
              <Sparkles className="size-3.5" /> AI summary
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{t.intel.summary}</p>
            {t.status !== "resolved" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Next step:</span>
                <span className="text-xs font-medium text-foreground">{t.intel.action}</span>
                {t.intel.suggestedReply && (
                  <Button size="xs" variant="outline" className="ml-auto bg-card" onClick={() => composerRef.current?.open("reply", true)}>
                    <Sparkles className="text-sky" /> Use suggested reply
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {timeline.map((item) =>
          item.kind === "n" ? (
            <NoteCard key={item.n.id} n={item.n} />
          ) : (
            <MessageCard
              key={item.m.id}
              m={item.m}
              collapsed={t.messages.length > 2 && item.m.id !== lastMsgId && !expanded.has(item.m.id)}
              onExpand={() => setExpanded((s) => new Set(s).add(item.m.id))}
              onOpenFile={setFile}
            />
          ),
        )}
      </div>

      <Composer key={t.id} ref={composerRef} thread={t} />
      <DocumentViewer file={file} onClose={() => setFile(undefined)} />
    </div>
  )
}
