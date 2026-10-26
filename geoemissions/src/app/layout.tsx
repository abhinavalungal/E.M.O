import type { Metadata } from "next"
import { cookies } from "next/headers"
import { after } from "next/server"
// Self-hosted fonts: builds and pages never call Google Fonts (works offline / behind the corporate proxy).
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { StoreProvider } from "@/lib/store"
import { runAutomation } from "@/lib/automation"
import { forViewer, loadWorkspace } from "@/lib/workspace"

export const metadata: Metadata = {
  title: { default: "GeoEmissions", template: "%s · GeoEmissions" },
  description: "GeoServe emissions operations workspace for the Geoemissions mailbox",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [workspace, jar] = await Promise.all([loadWorkspace(), cookies()])
  after(() => runAutomation(workspace)) // hourly mail sync + escalations, without holding up the page
  const uid = jar.get("uid")?.value
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body>
        <StoreProvider workspace={forViewer(workspace, uid)} meId={uid}>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
