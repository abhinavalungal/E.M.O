import type { Metadata } from "next"
import { VesselsTable } from "@/components/vessels"

export const metadata: Metadata = { title: "Vessels" }

export default function VesselsPage() {
  return <VesselsTable />
}
