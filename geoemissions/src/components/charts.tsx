"use client"

// Chart specs follow the data-viz rules: thin bars (≤24px), 2px surface gaps between stacked
// segments, one y-axis, hairline solid grid, legend for ≥2 series, hover tooltips.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { SLA_HOURS } from "@/lib/data"
import type { positions, responseWeekly, volumeWeekly } from "@/lib/metrics"
import { GROUP_COLOR } from "./pills"

const SURFACE = "#ffffff"

function NoData({ children }: { children: React.ReactNode }) {
  return <p className="flex h-[200px] items-center justify-center px-6 text-center text-[13px] text-muted-foreground">{children}</p>
}
const GRID = "#e9edf2"

const volumeConfig = {
  reports: { label: "Reports", color: GROUP_COLOR.reports },
  commercial: { label: "Commercial", color: GROUP_COLOR.commercial },
  regulatory: { label: "Regulatory", color: GROUP_COLOR.regulatory },
  queries: { label: "Customer queries", color: GROUP_COLOR.queries },
  other: { label: "Other", color: GROUP_COLOR.other },
} satisfies ChartConfig

export function VolumeChart({ data }: { data: ReturnType<typeof volumeWeekly> }) {
  const keys = Object.keys(volumeConfig) as (keyof typeof volumeConfig)[]
  if (!data.some((w) => keys.some((k) => w[k]))) return <NoData>No inbound email in the last 8 weeks.</NoData>
  return (
    <ChartContainer config={volumeConfig} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => v.toLocaleString()} />
        <ChartTooltip cursor={{ fill: "#f1f4f8" }} content={<ChartTooltipContent />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="v"
            fill={`var(--color-${k})`}
            stroke={SURFACE}
            strokeWidth={2}
            maxBarSize={24}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

// Stable references: recharts 3 re-syncs its store when array props change identity.
const RESPONSE_DOMAIN: [number, (max: number) => number] = [0, (max) => Math.max(10, Math.ceil(max / 2) * 2)] // never hide the SLA line

const responseConfig = { hours: { label: "Median first response (h)", color: "var(--chart-1)" } } satisfies ChartConfig

export function ResponseChart({ data }: { data: ReturnType<typeof responseWeekly> }) {
  if (!data.some((w) => w.hours !== null)) return <NoData>No replied customer emails yet. Customers are matched by sender domain from the orgs table.</NoData>
  return (
    <ChartContainer config={responseConfig} className="aspect-auto h-[200px] w-full">
      <LineChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={36} domain={RESPONSE_DOMAIN} tickFormatter={(v) => `${v}h`} />
        <ReferenceLine
          y={SLA_HOURS}
          stroke="#d03b3b"
          strokeWidth={1}
          label={{ value: `SLA ${SLA_HOURS}h`, position: "insideTopRight", fill: "#5b6b80", fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="hours"
          stroke="var(--color-hours)"
          strokeWidth={2}
          strokeLinecap="round"
          dot={{ r: 4, fill: "var(--color-hours)", stroke: SURFACE, strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}
        />
      </LineChart>
    </ChartContainer>
  )
}

const positionsConfig = {
  euaIn: { label: "EUA bought / received", color: "var(--chart-1)" },
  euaOut: { label: "EUA transferred / surrendered", color: "var(--chart-2)" },
} satisfies ChartConfig

export function PositionsChart({ data }: { data: ReturnType<typeof positions>["monthly"] }) {
  if (!data.some((m) => m.euaIn || m.euaOut)) return <NoData>No confirmed EUA movements in the last 6 months.</NoData>
  return (
    <ChartContainer config={positionsConfig} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `${v / 1000}k`} />
        <ChartTooltip cursor={{ fill: "#f1f4f8" }} content={<ChartTooltipContent />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Bar dataKey="euaIn" fill="var(--color-euaIn)" maxBarSize={24} radius={[4, 4, 0, 0]} />
        <Bar dataKey="euaOut" fill="var(--color-euaOut)" maxBarSize={24} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
