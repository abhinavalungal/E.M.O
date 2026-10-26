import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { MAILBOX } from "@/lib/data"

export const metadata: Metadata = { title: "Sign in" }

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(420px,5fr)_7fr]">
      <aside className="flex flex-col justify-between bg-brand px-8 py-8 text-white lg:px-12 lg:py-12">
        <Image src="/brand/geoserve-wordmark-white.png" alt="GeoServe — Determined to deliver" width={208} height={39} priority />
        <div className="hidden max-w-sm lg:block">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-white/50 uppercase">Emissions Workspace</p>
          <p className="mt-3 text-2xl leading-snug font-semibold">Every email to the GeoEmissions mailbox, organised by vessel, customer and obligation.</p>
          <p className="mt-3 text-sm leading-relaxed text-white/60">{MAILBOX}</p>
        </div>
        <p className="hidden text-xs text-white/40 lg:block">© {new Date().getFullYear()} GeoServe · Internal use only</p>
      </aside>

      <main className="flex items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-[360px]">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Use your GeoServe Microsoft account to continue.</p>

          <Link
            href="/"
            className="mt-8 flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <MicrosoftLogo /> Sign in with Microsoft
          </Link>

          <div className="mt-6 flex gap-2.5 rounded-md border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
            <p>
              Access is limited to <span className="font-medium text-foreground">@geoserves.com</span> accounts in the GeoEmissions security groups. Your
              organisation&apos;s sign-in policies, including MFA, apply.
            </p>
          </div>

          <p className="mt-8 text-center text-[11px] text-muted-foreground">Microsoft sign-in is not connected yet — you continue as the team member last picked in this browser.</p>
        </div>
      </main>
    </div>
  )
}
