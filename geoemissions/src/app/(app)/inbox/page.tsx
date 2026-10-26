import { Suspense } from "react"
import type { Metadata } from "next"
import { InboxWorkspace } from "@/components/inbox/inbox-workspace"

export const metadata: Metadata = { title: "Inbox" }

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxWorkspace />
    </Suspense>
  )
}
