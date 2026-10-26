const TZ = "Asia/Kolkata" // team works in Mumbai time
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ })
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })

// newer ICU renders "Sept"; keep three-letter months
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso)).replace("Sept", "Sep")
export const fmtShortDate = (iso: string) => shortDateFmt.format(new Date(iso)).replace("Sept", "Sep")
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso))
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)} IST`
export const fmtToday = () => weekdayFmt.format(new Date())
export const isToday = (iso: string) => fmtDate(iso) === fmtDate(new Date().toISOString()) // IST calendar day

const hoursFromNow = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3_600_000

/** Compact inbox-style time: "14:05", "Yesterday", "22 Sep". */
export function fmtListTime(iso: string) {
  const h = -hoursFromNow(iso)
  if (h < 12) return fmtTime(iso)
  if (h < 36) return "Yesterday"
  return fmtShortDate(iso)
}

/** "12m ago", "3h ago", "2d ago" */
export function fmtAgo(iso: string) {
  const h = -hoursFromNow(iso)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** Calendar days (IST) until a YYYY-MM-DD date; negative = past. */
export function daysUntil(date: string, now = Date.now()) {
  const todayIst = new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)
  return Math.round((Date.parse(date) - Date.parse(todayIst)) / 86_400_000)
}

export function slaState(iso?: string): { label: string; tone: "bad" | "warn" | "ok" } | null {
  if (!iso) return null
  const h = hoursFromNow(iso)
  if (h < 0) return { label: `SLA breached ${Math.round(-h)}h`, tone: "bad" }
  if (h < 2) return { label: `SLA ${h < 1 ? Math.round(h * 60) + "m" : Math.round(h) + "h"}`, tone: "warn" }
  return { label: `SLA ${Math.round(h)}h`, tone: "ok" }
}

export const fmtNum = (n: number) => n.toLocaleString("en-US")

export function fmtCompact(n: number) {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export function fmtMoney(n: number, currency: string, compact = false) {
  return Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(n)
}
