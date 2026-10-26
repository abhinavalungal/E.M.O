"use client"

// Template library: personal templates on the profile page, shared ones (per role) in Administration.
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { deleteTemplate, saveTemplate } from "@/app/actions"
import { CATEGORIES } from "@/lib/data"
import { useStore } from "@/lib/store"
import { PLACEHOLDERS } from "@/lib/templates"
import type { Category, Template } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, SectionCard } from "./page"
import { CategoryChip, Pill } from "./pills"

/** Template text with {{placeholders}} marked, so unfilled ones stand out. */
export function TemplateText({ body, className }: { body: string; className?: string }) {
  return (
    <p className={className ?? "text-[13px] leading-relaxed whitespace-pre-line text-foreground/85"}>
      {body.split(/(\{\{[^}]+\}\})/g).map((part, i) =>
        part.startsWith("{{") ? (
          <span key={i} className="rounded bg-sky-soft px-1 font-mono text-[11px] text-info">
            {part.slice(2, -2).trim()}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  )
}

type Draft = { id?: string; name: string; category: Category; body: string; shared: boolean; roles: string[] }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** `shared`: the admin's shared templates. Otherwise the user's own, plus shared ones they can copy. */
export function TemplateLibrary({ shared }: { shared: boolean }) {
  const { templates, me, can, roles, roleById } = useStore()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const isAdmin = can("admin")
  const mine = templates.filter((t) => (shared ? !t.ownerId : t.ownerId === me.id))
  const available = shared ? [] : templates.filter((t) => !t.ownerId && (!t.roles?.length || t.roles.includes(me.role)))

  const edit = (t: Template, copy = false) =>
    setDraft({ id: copy ? undefined : t.id, name: copy ? `${t.name} (copy)` : t.name, category: t.category, body: t.body, shared: copy ? shared : !t.ownerId, roles: t.roles ?? [] })
  const remove = (t: Template) =>
    deleteTemplate(me.id, t.id).then(
      () => (toast.success(`Deleted ${t.name}`), router.refresh()),
      (e) => toast.error("Couldn't delete", { description: errorText(e) }),
    )

  const card = (t: Template, editable: boolean) => (
    <SectionCard
      key={t.id}
      title={t.name}
      action={
        <span className="flex items-center gap-1">
          <CategoryChip category={t.category} />
          <Button variant="ghost" size="icon-xs" onClick={() => edit(t, true)} aria-label={`Duplicate ${t.name}`} title={editable ? "Duplicate" : "Copy to my templates"}>
            <Copy />
          </Button>
          {editable && (
            <>
              <Button variant="ghost" size="icon-xs" onClick={() => edit(t)} aria-label={`Edit ${t.name}`} title="Edit">
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => remove(t)} aria-label={`Delete ${t.name}`} title="Delete">
                <Trash2 />
              </Button>
            </>
          )}
        </span>
      }
      bodyClassName="p-4"
    >
      {!t.ownerId && (
        <p className="mb-2 flex flex-wrap gap-1">
          {t.roles?.length ? t.roles.map((r) => <Pill key={r}>{roleById(r)?.label ?? r}</Pill>) : <Pill>All roles</Pill>}
        </p>
      )}
      <TemplateText body={t.body} />
    </SectionCard>
  )

  return (
    <div id="templates" className="scroll-mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {shared ? "Shared with the roles you pick; everyone else can't see them." : "Only you see these. Pick them from Templates in the reply composer."} Placeholders are filled from the email when inserted.
        </p>
        {(!shared || isAdmin) && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setDraft({ name: "", category: "other", body: "", shared, roles: [] })}>
            <Plus /> New template
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {mine.length === 0 && (
          <div className="rounded-lg border bg-card md:col-span-2">
            <EmptyState icon={FileText} title={shared ? "No shared templates yet" : "No templates of your own yet"} hint="Create one, or duplicate a shared template to adapt it." />
          </div>
        )}
        {mine.map((t) => card(t, shared ? isAdmin : true))}
      </div>
      {available.length > 0 && (
        <>
          <p className="pt-2 text-xs font-medium text-muted-foreground">Shared with you · duplicate one to make it yours</p>
          <div className="grid gap-3 md:grid-cols-2">{available.map((t) => card(t, false))}</div>
        </>
      )}
      {draft && <TemplateEditor draft={draft} onClose={() => setDraft(null)} roles={roles.map((r) => ({ id: r.id, label: r.label }))} />}
    </div>
  )
}

function TemplateEditor({ draft, onClose, roles }: { draft: Draft; onClose: () => void; roles: { id: string; label: string }[] }) {
  const { me } = useStore()
  const router = useRouter()
  const [d, setD] = useState(draft)
  const [saving, setSaving] = useState(false)
  const body = useRef<HTMLTextAreaElement>(null)

  const insert = (key: string) => {
    const el = body.current
    const at = el?.selectionStart ?? d.body.length
    const tag = `{{${key}}}`
    setD({ ...d, body: d.body.slice(0, at) + tag + d.body.slice(el?.selectionEnd ?? at) })
    requestAnimationFrame(() => el?.focus())
  }
  const save = () => {
    setSaving(true)
    saveTemplate(me.id, d).then(
      () => {
        toast.success(`Saved ${d.name}`)
        router.refresh()
        onClose()
      },
      (e) => {
        setSaving(false)
        toast.error("Couldn't save template", { description: errorText(e) })
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>{d.shared ? "Shared template" : "Personal template — only you see it"}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Name
            <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Chase missing BDN" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Category
            <Select value={d.category} onValueChange={(v) => setD({ ...d, category: v as Category })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORIES[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Text
          <Textarea ref={body} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={8} className="text-[13px]" placeholder="Dear {{contact.first_name}}, …" />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Insert a placeholder">
          {PLACEHOLDERS.map((p) => (
            <button key={p} type="button" onClick={() => insert(p)} className="rounded bg-sky-soft px-1.5 py-0.5 font-mono text-[11px] text-info hover:bg-sky/20">
              {p}
            </button>
          ))}
        </div>
        {d.shared && (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Visible to (none ticked = all roles)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 text-[13px]">
                  <Checkbox checked={d.roles.includes(r.id)} onCheckedChange={(c) => setD({ ...d, roles: c ? [...d.roles, r.id] : d.roles.filter((x) => x !== r.id) })} />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Preview</p>
          {d.body.trim() ? <TemplateText body={d.body} /> : <p className="text-xs text-muted-foreground">Nothing yet.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !d.name.trim() || !d.body.trim()}>
            {saving ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
