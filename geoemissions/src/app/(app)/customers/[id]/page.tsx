import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { select } from "@/lib/db"
import type { Org } from "@/lib/types"
import { Customer360 } from "@/components/customers"

const customer = async (id: string) => (await select<Org>("orgs", `id=eq.${encodeURIComponent(id)}&kind=eq.customer`).catch(() => []))[0]

export async function generateMetadata({ params }: PageProps<"/customers/[id]">): Promise<Metadata> {
  const { id } = await params
  return { title: (await customer(id))?.name ?? "Customer" }
}

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params
  if (!(await customer(id))) notFound()
  return <Customer360 id={id} />
}
