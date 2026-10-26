import type { Metadata } from "next"
import { CustomersGrid } from "@/components/customers"

export const metadata: Metadata = { title: "Customers" }

export default function CustomersPage() {
  return <CustomersGrid />
}
