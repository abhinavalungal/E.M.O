"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Bot, Clock, Database, FileText, History, Lock, Mail, MessageSquare, Receipt, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { setRuleEnabled } from "@/app/actions"
import { MAILBOX, SLA_HOURS } from "@/lib/data"
import { fmtAgo, fmtDateTime } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Category } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CardLink, EmptyState, PageHeader, SectionCard } from "./page"
import { CategoryChip, Pill, UserAvatar } from "./pills"
import { EscalationPolicyCard, UsersAndRoles } from "./team-admin"
import { TemplateLibrary } from "./templates"
import { UrlTabs } from "./url-tabs"

const SLAS: { category: Category; first: string; escalate: string }[] = [
  { category: "customer_query", first: "1 business day", escalate: "Lead after 4h past SLA" },
  { category: "eu_ets", first: "4 business hours", escalate: "Lead immediately in surrender window" },
  { category: "allocation", first: "1 business day", escalate: "Account owner after 2 days" },
  { category: "allocation_confirmation", first: "Chase after 5 days", escalate: "Account owner after 7 days" },
  { category: "invoice", first: "2 business days", escalate: "Commercial lead" },
  { category: "fueleu", first: "2 business days", escalate: "Regulatory lead 7 days before deadline" },
  { category: "bdn", first: "Expected ≤ 7 days after bunkering", escalate: "Alert analyst on day 8" },
  { category: "vessel_report", first: "Noon report daily", escalate: "Alert after 48h silence" },
]

export function AdminPage({ tab }: { tab: string }) {
  const { rules, activity, threads, userById, sync, me, can } = useStore()
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const isOn = (id: string, saved: boolean) => enabled[id] ?? saved
  const integrations = [
    {
      icon: Mail,
      name: "Microsoft 365 · shared mailbox",
      detail: `${MAILBOX} via Microsoft Graph (app-only Mail.Read). The app syncs every hour (outlook-pipeline.py sync); Sync now in the header runs it any time.${sync.error ? ` Last error: ${sync.error}` : ""}`,
      status: sync.error ? "Sync failing" : sync.syncedAt ? `Connected · synced ${fmtAgo(sync.syncedAt)}` : "Never synced",
      tone: sync.error || !sync.syncedAt ? ("warn" as const) : ("ok" as const),
    },
    { icon: Database, name: "Supabase (Postgres)", detail: "Master data, commercial records, triage state, notes and audit log", status: "Connected", tone: "ok" as const },
    { icon: Bot, name: "Azure OpenAI (in tenant)", detail: "Classification, extraction, summaries, reply drafts", status: "Not connected", tone: "neutral" as const },
    { icon: MessageSquare, name: "Microsoft Teams", detail: "Critical alerts and assignments to a channel or personal chat", status: "Not connected", tone: "neutral" as const },
    { icon: TrendingUp, name: "Carbon trading platform", detail: "Authoritative EUA/UKA positions and trades", status: "Not connected", tone: "neutral" as const },
    { icon: Receipt, name: "Invoicing system", detail: "Invoice status sync", status: "Not connected", tone: "neutral" as const },
  ]

  if (!can("admin"))
    return <EmptyState icon={Lock} title="Administration is for admins" hint="Ask an admin to give your role the Administration capability." />

  return (
    <>
      <PageHeader title="Administration" description="Classification rules, shared templates, SLAs and escalation, users and roles, integrations and the audit trail.">
        <UrlTabs
          base="/admin"
          current={tab}
          tabs={[
            { value: "rules", label: "Classification rules" },
            { value: "templates", label: "Shared templates" },
            { value: "slas", label: "SLAs & escalation" },
            { value: "roles", label: "Users & roles" },
            { value: "integrations", label: "Integrations" },
            { value: "audit", label: "Audit log" },
          ]}
        />
      </PageHeader>

      <div className="space-y-4 px-4 py-5 md:px-6">
        {tab === "rules" && (
          <>
            <SectionCard title="Classification rules" action={<span className="text-xs text-muted-foreground">Add or edit rows in the rules table</span>}>
              {rules.length === 0 ? (
                <EmptyState icon={FileText} title="No rules" hint="Without rules every email is classified as Other." />
              ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4 text-xs">Rule</TableHead>
                    <TableHead className="text-xs">Pattern (subject + attachment names)</TableHead>
                    <TableHead className="text-xs">Then</TableHead>
                    <TableHead className="text-right text-xs">Confidence</TableHead>
                    <TableHead className="text-right text-xs">Threads matched</TableHead>
                    <TableHead className="pr-4 text-center text-xs">Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id} className={cn(!isOn(r.id, r.enabled) && "opacity-55")}>
                      <TableCell className="pl-4">
                        <span className="block text-[13px] font-medium">{r.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{r.id}</span>
                      </TableCell>
                      <TableCell className="max-w-[340px] font-mono text-[11px] break-all text-muted-foreground">{r.pattern}</TableCell>
                      <TableCell>
                        <CategoryChip category={r.category} />
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular">{Math.round(r.confidence * 100)}%</TableCell>
                      <TableCell className="text-right text-[13px] tabular">{threads.filter((t) => t.labels[0].ruleId === r.id).length.toLocaleString()}</TableCell>
                      <TableCell className="pr-4 text-center">
                        <Checkbox
                          checked={isOn(r.id, r.enabled)}
                          disabled={!can("admin")}
                          onCheckedChange={(c) => {
                            setEnabled({ ...enabled, [r.id]: !!c })
                            setRuleEnabled(me.id, r.id, !!c).then(
                              () => toast.success(`${r.id} ${c ? "enabled" : "disabled"}`, { description: "Applies on the next refresh." }),
                              (e) => toast.error("Couldn't save rule", { description: String(e) }),
                            )
                          }}
                          aria-label={`Enable ${r.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </SectionCard>
            <p className="text-[11px] text-muted-foreground">
              Rules run in order on each conversation&apos;s subjects and attachment names; the first enabled match sets the category, otherwise it is Other.
              Corrections made in the inbox are saved per conversation.
            </p>
          </>
        )}

        {tab === "templates" && <TemplateLibrary shared />}

        {tab === "slas" && (
          <>
            <EscalationPolicyCard />
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-[13px]">
              <Clock className="size-4 text-muted-foreground" />
              <span>
                Business hours <span className="font-medium">Mon–Fri 09:30–18:30 IST</span> · Holiday calendar{" "}
                <span className="font-medium">India (Maharashtra)</span>
              </span>
              <span className="ml-auto text-xs text-muted-foreground">Enforced in the app today: {SLA_HOURS}h first response on customer emails</span>
            </div>
            <SectionCard title="Response targets & escalation">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4 text-xs">Category</TableHead>
                    <TableHead className="text-xs">Target</TableHead>
                    <TableHead className="pr-4 text-xs">Escalation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SLAS.map((s) => (
                    <TableRow key={s.category}>
                      <TableCell className="pl-4">
                        <CategoryChip category={s.category} />
                      </TableCell>
                      <TableCell className="text-[13px] font-medium">{s.first}</TableCell>
                      <TableCell className="pr-4 text-[13px] text-muted-foreground">{s.escalate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        )}

        {tab === "roles" && <UsersAndRoles />}

        {tab === "integrations" && (
          <div className="grid gap-3 md:grid-cols-2">
            {integrations.map((i) => (
              <div key={i.name} className="flex gap-3 rounded-lg border bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <i.icon className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">{i.name}</span>
                    <Pill tone={i.tone}>{i.status}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{i.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "audit" && (
          <SectionCard title="Audit log" action={<span className="text-xs text-muted-foreground">Latest 200 actions</span>}>
            {activity.length === 0 ? (
              <EmptyState icon={History} title="No activity yet" hint="Assignments, status changes, notes and confirmations are recorded here." />
            ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4 text-xs">When</TableHead>
                  <TableHead className="text-xs">Who</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="pr-4 text-xs">Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(a.at)}</TableCell>
                    <TableCell className="text-[13px] whitespace-nowrap">
                      {a.actorId === "system" ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Bot className="size-4" /> Automation
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <UserAvatar userId={a.actorId} size="xs" /> {userById(a.actorId)?.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{a.action}</TableCell>
                    <TableCell className="pr-4 text-[13px]">{a.href ? <CardLink href={a.href}>{a.target}</CardLink> : a.target}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </SectionCard>
        )}
      </div>
    </>
  )
}
