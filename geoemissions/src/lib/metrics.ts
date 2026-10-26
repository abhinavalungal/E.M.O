// Chart and position numbers computed from live records (mail threads, carbon transactions).
import { CATEGORIES } from "./data.ts"
import type { CarbonTxn, Group, Thread } from "./types"

const DAY = 86_400_000
const WEEK = 7 * DAY
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })

// ponytail: weeks start Monday 00:00 UTC (05:30 IST); switch to IST weeks if the team notices the edge.
function weekStart(ms: number) {
  const d = new Date(ms)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY
}

function weeks(n: number, now: number) {
  const first = weekStart(now) - (n - 1) * WEEK
  return {
    first,
    labels: Array.from({ length: n }, (_, i) => dayFmt.format(first + i * WEEK).replace("Sept", "Sep")),
    index: (iso: string) => Math.floor((Date.parse(iso) - first) / WEEK),
  }
}

/** Inbound messages per week, stacked by the thread's category group. */
export function volumeWeekly(threads: Thread[], n = 8, now = Date.now()) {
  const w = weeks(n, now)
  const rows = w.labels.map((week) => ({ week, reports: 0, commercial: 0, regulatory: 0, queries: 0, other: 0 }))
  for (const t of threads) {
    const group: Group = CATEGORIES[t.labels[0].category].group
    for (const m of t.messages) {
      const i = w.index(m.at)
      if (m.direction === "in" && i >= 0 && i < n) rows[i][group]++
    }
  }
  return rows
}

/** Median hours from a customer's first message to our first reply, by the week the customer wrote. */
export function responseWeekly(threads: Thread[], n = 8, now = Date.now()) {
  const w = weeks(n, now)
  const samples: number[][] = w.labels.map(() => [])
  for (const t of threads.filter((t) => t.customerId)) {
    const firstIn = t.messages.find((m) => m.direction === "in")
    const reply = firstIn && t.messages.find((m) => m.direction === "out" && m.at > firstIn.at)
    const i = firstIn ? w.index(firstIn.at) : -1
    if (reply && i >= 0 && i < n) samples[i].push((Date.parse(reply.at) - Date.parse(firstIn.at)) / 3_600_000)
  }
  return w.labels.map((week, i) => {
    const s = samples[i].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    const hours = s.length ? (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) : null
    return { week, hours: hours === null ? null : Math.round(hours * 10) / 10 }
  })
}

const SIGN: Record<CarbonTxn["type"], 1 | -1> = { buy: 1, transfer_in: 1, sell: -1, transfer_out: -1, surrender: -1 }

/** Positions from booked (confirmed/settled) transactions; committed = proposed outflows. */
export function positions(txns: CarbonTxn[], months = 6, now = Date.now()) {
  const booked = txns.filter((x) => x.status !== "proposed")
  const of = (instrument: CarbonTxn["instrument"]) => ({
    balance: booked.filter((x) => x.instrument === instrument).reduce((s, x) => s + SIGN[x.type] * x.qty, 0),
    committed: txns.filter((x) => x.status === "proposed" && x.instrument === instrument && SIGN[x.type] < 0).reduce((s, x) => s + x.qty, 0),
  })
  const today = new Date(now)
  const monthly = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1 - i), 1))
    const key = d.toISOString().slice(0, 7)
    const inMonth = booked.filter((x) => x.instrument === "EUA" && x.date.startsWith(key))
    return {
      month: monthFmt.format(d).replace("Sept", "Sep"),
      euaIn: inMonth.filter((x) => SIGN[x.type] > 0).reduce((s, x) => s + x.qty, 0),
      euaOut: inMonth.filter((x) => SIGN[x.type] < 0).reduce((s, x) => s + x.qty, 0),
    }
  })
  return { eua: of("EUA"), uka: of("UKA"), monthly }
}
