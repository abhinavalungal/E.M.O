"use client"

// Attachment viewer with Document Intelligence: preview, Summarize, Extract data. Runs on the server, no AI.
import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Check, Copy, Download, ExternalLink, FileSearch, ListTree, Loader2, ScanText } from "lucide-react"
import { analysisText, type Field, type Found } from "@/lib/document-analysis"
import type { DocumentResult } from "@/lib/documents"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { FileIcon } from "../pills"

export const ANALYZABLE = /\.(pdf|png|jpe?g|tiff?|bmp|gif|webp|txt|csv)$/i
export type ViewerFile = { messageId: string; id: string; name: string }
type View = "preview" | "summary" | "data" | "text"

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={`${label}: ${text.slice(0, 60)}`}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          toast.error("Couldn't copy", { description: "The browser blocked clipboard access." })
        }
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function Block({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {copy && <CopyButton text={copy} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {children}
    </section>
  )
}

const fieldText = (f: Field) => `${f.label}: ${f.value}${f.unit && !f.value.includes(f.unit) ? " " + f.unit : ""}`

function FieldRows({ rows }: { rows: Field[] }) {
  return (
    <dl className="divide-y rounded-md border">
      {rows.map((f, i) => (
        <div key={i} className="group flex items-start gap-3 px-3 py-1.5 text-[13px]">
          <dt className="w-2/5 shrink-0 text-muted-foreground">{f.label}</dt>
          <dd className="min-w-0 flex-1 font-medium break-words text-foreground">
            {f.value}
            {f.unit && !f.value.includes(f.unit) && <span className="ml-1 font-normal text-muted-foreground">{f.unit}</span>}
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">p.{f.page}</span>
          </dd>
          <CopyButton text={f.unit && !f.value.includes(f.unit) ? `${f.value} ${f.unit}` : f.value} label={`Copy ${f.label}`} />
        </div>
      ))}
    </dl>
  )
}

function FoundRows({ rows }: { rows: Found[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((x, i) => (
        <li key={i} className="flex items-start gap-3 px-3 py-1.5 text-[13px]">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{x.kind}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{x.value}</span>
            <span className="block truncate text-[11px] text-muted-foreground" title={x.context}>
              p.{x.page} · {x.context}
            </span>
          </span>
          <CopyButton text={x.value} label={`Copy ${x.kind}`} />
        </li>
      ))}
    </ul>
  )
}

function Summary({ r }: { r: DocumentResult }) {
  const s = r.summary
  const empty = !s.keyPoints.length && !s.actions.length && !s.dates.length && !s.figures.length && !s.parties.length
  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-[15px] font-semibold text-foreground">{s.title ?? r.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[s.docType, `${r.pages} page${r.pages === 1 ? "" : "s"}`, r.ocrPages.length && `OCR on ${r.ocrPages.length === r.pages ? "all pages" : `p.${r.ocrPages.join(", ")}`}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      {empty && <p className="text-[13px] text-muted-foreground">No key points, dates or figures were recognised. The Text tab shows everything that was read.</p>}
      {s.parties.length > 0 && (
        <Block title="Parties" copy={s.parties.map(fieldText).join("\n")}>
          <FieldRows rows={s.parties} />
        </Block>
      )}
      {s.keyPoints.length > 0 && (
        <Block title="Key points" copy={s.keyPoints.map((k) => `- ${k}`).join("\n")}>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-foreground">
            {s.keyPoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Block>
      )}
      {s.actions.length > 0 && (
        <Block title="Action items" copy={s.actions.map((k) => `- ${k}`).join("\n")}>
          <ul className="space-y-1.5 text-[13px]">
            {s.actions.map((k, i) => (
              <li key={i} className="flex gap-2 rounded-md border border-warn/20 bg-warn-soft px-3 py-1.5 text-foreground">
                <span aria-hidden className="text-warn">→</span>
                {k}
              </li>
            ))}
          </ul>
        </Block>
      )}
      {s.dates.length > 0 && (
        <Block title="Dates">
          <FoundRows rows={s.dates} />
        </Block>
      )}
      {s.figures.length > 0 && (
        <Block title="Figures">
          <FoundRows rows={s.figures} />
        </Block>
      )}
    </div>
  )
}

function Data({ r }: { r: DocumentResult }) {
  const d = r.data
  if (!d.fields.length && !d.tables.length && !d.identifiers.length && !d.dates.length && !d.figures.length)
    return <p className="text-[13px] text-muted-foreground">No structured data was recognised. The Text tab shows everything that was read.</p>
  return (
    <div className="space-y-5">
      {d.identifiers.length > 0 && (
        <Block title="Identifiers" copy={d.identifiers.map((x) => `${x.kind}: ${x.value}`).join("\n")}>
          <FoundRows rows={d.identifiers} />
        </Block>
      )}
      {d.fields.length > 0 && (
        <Block title={`Fields (${d.fields.length})`} copy={d.fields.map(fieldText).join("\n")}>
          <FieldRows rows={d.fields} />
        </Block>
      )}
      {d.tables.map((t, i) => (
        <Block key={i} title={`Table ${i + 1} · page ${t.page}`} copy={t.rows.map((row) => row.join("\t")).join("\n")}>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <tbody>
                {t.rows.map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-muted/50 font-medium" : "border-t"}>
                    {row.map((c, ci) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      ))}
      {d.figures.length > 0 && (
        <Block title={`Figures (${d.figures.length})`} copy={d.figures.map((x) => `${x.kind}: ${x.value}`).join("\n")}>
          <FoundRows rows={d.figures} />
        </Block>
      )}
      {d.dates.length > 0 && (
        <Block title={`Dates (${d.dates.length})`} copy={d.dates.map((x) => x.value).join("\n")}>
          <FoundRows rows={d.dates} />
        </Block>
      )}
    </div>
  )
}

export function DocumentViewer({ file, onClose }: { file?: ViewerFile; onClose: () => void }) {
  const [view, setView] = useState<View>("preview")
  const [result, setResult] = useState<{ key: string; data?: DocumentResult; error?: string }>()
  const key = file ? `${file.messageId}/${file.id}` : ""
  const src = file ? `/api/mail/${encodeURIComponent(file.messageId)}/attachments/${encodeURIComponent(file.id)}` : ""
  const mine = result?.key === key ? result : undefined
  const loading = !!file && view !== "preview" && !mine?.data && !mine?.error

  const run = (v: View) => {
    setView(v)
    if (v === "preview" || !file || (mine && !mine.error)) return // already loaded or loading: Summarize and Extract share one run
    setResult({ key })
    fetch(`${src}/analyze`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
        setResult(r.ok ? { key, data: j } : { key, error: j.error ?? `HTTP ${r.status}` })
      })
      .catch((e) => setResult({ key, error: e instanceof Error ? e.message : String(e) }))
  }
  // Re-opening another file starts on the preview.
  const [shown, setShown] = useState(key)
  if (shown !== key) {
    setShown(key)
    setView("preview")
  }

  const data = mine?.data
  const pdf = /\.pdf$/i.test(file?.name ?? "")
  const img = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file?.name ?? "")
  const tabs: { v: View; label: string; icon: React.ElementType }[] = [
    { v: "preview", label: "Preview", icon: ExternalLink },
    { v: "summary", label: "Summarize", icon: FileSearch },
    { v: "data", label: "Extract data", icon: ListTree },
    { v: "text", label: "Text", icon: ScanText },
  ]

  return (
    <Sheet open={!!file} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="flex items-center gap-2 text-[15px]">
            <FileIcon kind={file?.name.split(".").pop()?.toLowerCase() ?? ""} />
            <span className="truncate">{file?.name}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">Summaries and data are read from the file on this server (text layer, OCR for scans). Check important values against the original.</SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Document views">
            {tabs.map((t) => (
              <Button key={t.v} role="tab" aria-selected={view === t.v} size="xs" variant={view === t.v ? "default" : "outline"} onClick={() => run(t.v)}>
                <t.icon /> {t.label}
              </Button>
            ))}
            <span className="ml-auto flex items-center gap-1">
              {data && (view === "summary" || view === "data") && (
                <>
                  <Button size="xs" variant="ghost" onClick={() => navigator.clipboard.writeText(analysisText(data, view)).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}>
                    <Copy /> Copy all
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(view === "summary" ? data.summary : data.data, null, 2)).then(() => toast.success("Copied as JSON"), () => toast.error("Couldn't copy"))}
                  >
                    JSON
                  </Button>
                </>
              )}
              <Button size="xs" variant="ghost" asChild>
                <a href={`${src}?download`} aria-label="Download">
                  <Download />
                </a>
              </Button>
            </span>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "preview" ? (
            pdf ? (
              <iframe title={file?.name} src={src} className="h-full min-h-[70vh] w-full border-0 bg-muted" />
            ) : img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={file?.name ?? ""} className="mx-auto max-h-full max-w-full p-4" />
            ) : (
              <p className="p-6 text-[13px] text-muted-foreground">
                No preview for this type. Use Summarize or Extract data, or{" "}
                <a href={`${src}?download`} className="text-sky hover:underline">
                  download it
                </a>
                .
              </p>
            )
          ) : loading ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-[13px] text-muted-foreground" role="status">
              <Loader2 className="size-5 animate-spin" />
              Reading the document… scanned pages are OCR&apos;d and take a few seconds each.
            </div>
          ) : mine?.error ? (
            <div className="m-4 rounded-lg border border-bad/25 bg-bad-soft p-4 text-[13px]" role="alert">
              <p className="flex items-center gap-1.5 font-medium text-bad">
                <AlertTriangle className="size-4" /> Couldn&apos;t read this file
              </p>
              <p className="mt-1 text-foreground/80">{mine.error}</p>
              <Button size="xs" variant="outline" className="mt-3 bg-card" onClick={() => (setResult(undefined), run(view))}>
                Try again
              </Button>
            </div>
          ) : data ? (
            <div className="space-y-4 p-4">
              {data.warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5 rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-xs text-warn">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" /> {w}
                </p>
              ))}
              {view === "summary" && <Summary r={data} />}
              {view === "data" && <Data r={data} />}
              {view === "text" && (
                <Block title={`Text · ${data.pages} page${data.pages === 1 ? "" : "s"}${data.ocrConfidence !== undefined ? ` · OCR confidence ${data.ocrConfidence}%` : ""}`} copy={data.text}>
                  <pre className="rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">{data.text}</pre>
                </Block>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
