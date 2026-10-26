"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { X } from "lucide-react"
import { saveAvailability, saveProfile, saveViews } from "@/app/actions"
import { MAILBOX } from "@/lib/data"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader, SectionCard } from "./page"
import { CategoryChip, UserAvatar } from "./pills"
import { AvailabilityFields, AwayPill } from "./team-admin"
import { TemplateLibrary } from "./templates"

const EVENTS = [
  { key: "assigned", label: "An email is assigned to me", inApp: true, teams: true, email: false },
  { key: "mention", label: "I'm @mentioned in a note", inApp: true, teams: true, email: false },
  { key: "sla", label: "SLA at risk on my emails", inApp: true, teams: true, email: false },
  { key: "critical", label: "Critical alerts for my role", inApp: true, teams: true, email: true },
  { key: "reply", label: "A customer replies to my thread", inApp: true, teams: false, email: false },
]
const CHANNELS = ["inApp", "teams", "email"] as const
const CHANNEL_LABEL = { inApp: "In-app", teams: "Teams", email: "Email" }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-4 py-2.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

export function ProfilePage() {
  const { me, myRole, users, userById } = useStore()
  const router = useRouter()
  const [away, setAway] = useState({ availability: me.availability ?? "available", awayFrom: me.awayFrom ?? "", awayUntil: me.awayUntil ?? "", backupId: me.backupId ?? "" })
  const saveAway = () =>
    saveAvailability(me.id, away).then(
      () => (toast.success("Availability saved", { description: away.availability === "available" ? undefined : "Your backup is alerted to your open emails." }), router.refresh()),
      (e) => toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) }),
    )
  const removeView = (name: string) =>
    saveViews(me.id, (me.views ?? []).filter((v) => v.name !== name)).then(
      () => router.refresh(),
      (e) => toast.error("Couldn't remove view", { description: String(e) }),
    )
  const [prefs, setPrefs] = useState(() => ({
    ...Object.fromEntries(EVENTS.map((e) => [e.key, { inApp: e.inApp, teams: e.teams, email: e.email }])),
    ...me.prefs,
  }))
  const [digest, setDigest] = useState(me.prefs?.digest?.email ?? true)
  const [signature, setSignature] = useState(me.signature ?? "")
  const save = () =>
    saveProfile(me.id, signature, { ...prefs, digest: { email: digest } }).then(
      () => toast.success("Preferences saved"),
      (e) => toast.error("Couldn't save", { description: String(e) }),
    )
  const sig = signature || `${me.name}\n${myRole?.label ?? me.role}, GeoServe Emissions Team\n${MAILBOX}`

  return (
    <>
      <PageHeader
        title="Profile & preferences"
        description="Your availability, backup, templates, saved views and notification settings. They only affect how GeoEmissions works for you."
        actions={
          <Button size="sm" onClick={save}>
            Save changes
          </Button>
        }
      />
      <div className="mx-auto grid max-w-[1100px] gap-4 px-4 py-5 md:px-6 lg:grid-cols-5">
        <SectionCard className="lg:col-span-2" title="Account" bodyClassName="px-4 py-2">
          <div className="flex items-center gap-3 border-b py-3">
            <UserAvatar userId={me.id} size="md" className="size-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">{me.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{me.email}</p>
            </div>
          </div>
          <dl className="divide-y">
            <Row label="Role">
              {myRole?.label ?? me.role}
              {me.lead && " · Team lead"}
            </Row>
            <Row label="Time zone">Asia/Kolkata (IST)</Row>
            <Row label="Sends as">{MAILBOX}</Row>
            <Row label="Default categories">
              <span className="flex flex-wrap gap-1">
                {myRole?.capabilities.includes("mail.all") ? "All categories" : myRole?.categories.map((c) => <CategoryChip key={c} category={c} />)}
              </span>
            </Row>
          </dl>
          <p className="pt-2 pb-2 text-[11px] text-muted-foreground">Name, email and role are managed by an admin in Administration → Users & roles.</p>
        </SectionCard>

        <div className="space-y-4 lg:col-span-3">
          <SectionCard title="Availability & backup" action={<AwayPill user={me} />} bodyClassName="space-y-3 p-4">
            <AvailabilityFields value={away} onChange={(p) => setAway({ ...away, ...p })} backups={users.filter((u) => u.id !== me.id)} />
            <p className="text-[11px] text-muted-foreground">
              While you are away, your backup{me.backupId ? ` (${userById(me.backupId)?.name})` : ""} is alerted to your open emails and can see them; if an admin turned on
              reassignment, they move to your backup.
            </p>
            <Button size="sm" variant="outline" onClick={saveAway}>
              Save availability
            </Button>
          </SectionCard>

          <SectionCard title="Notifications" action={<span className="text-xs text-muted-foreground">Saved now · Teams and email delivery not connected yet</span>} bodyClassName="px-4 py-2">
            <div id="notifications" className="scroll-mt-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Event</th>
                    {CHANNELS.map((c) => (
                      <th key={c} className="w-16 py-2 text-center font-medium">
                        {CHANNEL_LABEL[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {EVENTS.map((e) => (
                    <tr key={e.key}>
                      <td className="py-2.5 pr-3 text-foreground">{e.label}</td>
                      {CHANNELS.map((c) => (
                        <td key={c} className="text-center">
                          <Checkbox
                            checked={prefs[e.key][c]}
                            onCheckedChange={(v) => setPrefs({ ...prefs, [e.key]: { ...prefs[e.key], [c]: !!v } })}
                            aria-label={`${e.label} — ${CHANNEL_LABEL[c]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="mt-2 flex items-center gap-2.5 border-t py-3 text-[13px]">
                <Checkbox checked={digest} onCheckedChange={(v) => setDigest(!!v)} />
                <span>
                  Daily <span className="font-medium">“Your GeoEmissions Summary”</span> email at 09:00 IST
                </span>
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Saved inbox views" bodyClassName="px-4 py-2">
            {me.views?.length ? (
              <ul className="divide-y">
                {me.views.map((v) => (
                  <li key={v.name} className="flex items-center gap-2 py-2 text-[13px]">
                    <Link href={`/inbox?${v.query}`} className="font-medium hover:underline">
                      {v.name}
                    </Link>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{v.query}</span>
                    <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={() => removeView(v.name)} aria-label={`Remove view ${v.name}`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-xs text-muted-foreground">Filter the inbox, then use Save view; your views appear in the sidebar.</p>
            )}
          </SectionCard>

          <SectionCard title="Email signature" bodyClassName="p-4">
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={sig}
              rows={3}
              className="text-[13px]"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Appended to replies you send from {MAILBOX}. Leave empty to use the default shown.
            </p>
          </SectionCard>
        </div>
        <div className="lg:col-span-5">
          <h2 className="mb-2 text-[13px] font-semibold">My templates</h2>
          <TemplateLibrary shared={false} />
        </div>
      </div>
    </>
  )
}
