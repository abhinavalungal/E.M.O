import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { select } from "@/lib/db"
import type { Vessel } from "@/lib/types"
import { Vessel360 } from "@/components/vessel-360"

const vessel = async (imo: string) => (await select<Vessel>("vessels", `imo=eq.${encodeURIComponent(imo)}`).catch(() => []))[0]

export async function generateMetadata({ params }: PageProps<"/vessels/[imo]">): Promise<Metadata> {
  const { imo } = await params
  return { title: (await vessel(imo))?.name ?? "Vessel" }
}

export default async function VesselPage({ params, searchParams }: PageProps<"/vessels/[imo]">) {
  const { imo } = await params
  const { tab } = await searchParams
  if (!(await vessel(imo))) notFound()
  return <Vessel360 imo={imo} tab={typeof tab === "string" ? tab : "overview"} />
}
