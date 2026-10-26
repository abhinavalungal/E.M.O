import type { Metadata } from "next"
import { AdminPage } from "@/components/admin"

export const metadata: Metadata = { title: "Admin" }

export default async function Page({ searchParams }: PageProps<"/admin">) {
  const { tab } = await searchParams
  return <AdminPage tab={typeof tab === "string" ? tab : "rules"} />
}
