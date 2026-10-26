import type { Metadata } from "next"
import { CommercialPage } from "@/components/commercial"

export const metadata: Metadata = { title: "Commercial" }

export default async function Page({ searchParams }: PageProps<"/commercial">) {
  const { tab, kind, q } = await searchParams
  const str = (v: string | string[] | undefined, fallback = "") => (typeof v === "string" ? v : fallback)
  return <CommercialPage tab={str(tab, "allocations")} kind={str(kind, "all")} q={str(q) || undefined} />
}
