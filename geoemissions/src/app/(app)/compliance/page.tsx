import type { Metadata } from "next"
import { CompliancePage } from "@/components/compliance"

export const metadata: Metadata = { title: "Compliance" }

export default async function Page({ searchParams }: PageProps<"/compliance">) {
  const { tab, period, customer } = await searchParams
  const str = (v: string | string[] | undefined, fallback = "") => (typeof v === "string" ? v : fallback)
  return <CompliancePage tab={str(tab, "matrix")} period={Number(str(period, String(new Date().getFullYear())))} customer={str(customer)} />
}
