// Rule-based document understanding (no AI): from extracted page text to a summary and copyable structured data.
// Input is plain lines per page; a "\t" inside a line marks a wide horizontal gap (a column break) in the PDF.
// Format-agnostic on purpose: PDFs, OCR'd scans, text files and future types all reduce to pages of lines.
import { extractImos } from "./imo.ts"

export type Page = { lines: string[]; ocr?: boolean }
export type Field = { label: string; value: string; unit?: string; page: number }
export type Found = { kind: string; value: string; context: string; page: number }
export type Table = { page: number; rows: string[][] }
export type Analysis = {
  summary: { title?: string; docType?: string; keyPoints: string[]; actions: string[]; dates: Found[]; figures: Found[]; parties: Field[] }
  data: { fields: Field[]; tables: Table[]; identifiers: Found[]; dates: Found[]; figures: Found[] }
}

const UNITS = "MT|mt|t|tonnes?|tons?|kg|m3|m³|cbm|ltrs?|L|litres?|liters?|%|nm|NM|knots|kn|kts|kWh|kW|MW|rpm|°C|degC|hrs?|days?|gCO2e?/MJ|tCO2e?|CO2e?|EUAs?|UKAs?|MJ|GJ"
const CURRENCY = "USD|EUR|GBP|INR|AED|SGD|CHF|€|\\$|£"
// A space, never a tab, may separate digits, number and unit: a tab is a column break.
const NUMBER = "\\d{1,3}(?:[, ]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?"
const MONTHS = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
const DATE_RES = [
  new RegExp(`\\b\\d{1,2}[./-]\\d{1,2}[./-](?:\\d{4}|\\d{2})\\b`, "g"),
  /\b\d{4}-\d{2}-\d{2}\b/g,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?[\\s-](?:${MONTHS})[,\\s-]+\\d{4}\\b`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
]
const AMOUNT_RES = [
  new RegExp(`(?:${CURRENCY}) ?(?:${NUMBER})(?!\\d)`, "g"),
  new RegExp(`(?<![\\w.,])(?:${NUMBER}) ?(?:${CURRENCY.replace("|€|\\$|£", "")})\\b`, "g"),
]
const QTY_RE = new RegExp(`(?<![\\w.,])(?:${NUMBER}) ?(?:${UNITS})(?![\\w])`, "g")
// Reference-style identifiers must contain a digit, so "BDN Number" or "Invoice Date" never count as one.
const IDS: [string, RegExp][] = [
  ["Invoice no.", /\b(?:invoice|inv)\s*(?:no\.?|number|#)?\s*[:.]?\s*((?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{3,})/gi],
  ["BDN no.", /\bBDN\s*(?:no\.?|number|#)?\s*[:.]?\s*((?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{3,})/gi],
  ["Voyage", /\bvoy(?:age)?\.?\s*(?:no\.?|number|#)?\s*[:.]?\s*(\d[\dA-Z/-]{0,11})\b/gi],
  ["Reference", /\b(?:our |your )?ref(?:erence)?\.?\s*(?:no\.?|number|#)?\s*[:.]\s*((?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{3,})/gi],
  ["Email", /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g],
]
const PARTY = /^(from|to|bill(?:ed)? to|sold to|seller|buyer|supplier|vendor|customer|client|company|owner|charterer|verifier|issued (?:by|to)|shipper|consignee|ship ?owner|operator|manager)$/i
const DOC_TYPES: [RegExp, string][] = [
  [/bunker delivery note|\bBDN\b/i, "Bunker delivery note"],
  [/fuel ?eu/i, "FuelEU statement"],
  [/\bEU ?ETS\b|EUA statement|emission allowance/i, "EU ETS statement"],
  [/\bSEEMP\b/i, "SEEMP document"],
  [/\bMRV\b|monitoring plan/i, "MRV document"],
  [/statement of (?:compliance|fact)|\bDoC\b|verification (?:report|statement)/i, "Verification document"],
  [/invoice|amount due|total due/i, "Invoice"],
  [/statement of account/i, "Statement of account"],
  [/charter ?party|\bC\/?P\b|fixture recap|recap/i, "Charter party / recap"],
  [/bill of lading|\bB\/L\b/i, "Bill of lading"],
  [/noon report|arrival report|departure report/i, "Vessel report"],
  [/certificate/i, "Certificate"],
  [/agreement|contract/i, "Agreement"],
]
const KEY_WORDS = /\b(total|amount|due|balance|verified|emissions?|surrender|deficit|surplus|penalt|compliance|deadline|payable|net|gross|quantity|consumption|CO2|GHG|intensity|result|rating|conclusion|approved|rejected|outstanding)/i
const ACTION_WORDS = /\b(please|kindly|must|shall|required?|requested?|deadline|no later than|before|by \d|submit|provide|pay(?:ment)?|remit|confirm|sign|return|send|complete|respond|ensure|action)\b/i

const clean = (s: string) => s.replace(/\t/g, "  ").replace(/\s+/g, " ").trim()
const ctx = (line: string) => (line.length > 140 ? clean(line).slice(0, 137) + "…" : clean(line))

function splitUnit(label: string, value: string): { label: string; value: string; unit?: string } {
  const lu = label.match(/^(.*?)\s*\(([^()]{1,12})\)\s*$/)
  if (lu) return { label: lu[1].trim(), value, unit: lu[2].trim() }
  const vu = value.match(new RegExp(`^(${NUMBER})\\s?(${UNITS}|${CURRENCY})$`))
  return vu ? { label, value, unit: vu[2] } : { label, value }
}

function findAll(pages: Page[], res: RegExp[], kind: string): Found[] {
  const out: Found[] = []
  const seen = new Set<string>()
  pages.forEach((p, i) =>
    p.lines.forEach((line) => {
      for (const re of res)
        for (const m of line.matchAll(re)) {
          const value = clean(m[1] ?? m[0])
          if (seen.has(value)) continue
          seen.add(value)
          out.push({ kind, value, context: ctx(line), page: i + 1 })
        }
    }),
  )
  return out
}

/** Sentences, each tagged with its page. A wrapped line joins the previous one only when it continues in lower case. */
function sentences(pages: Page[]) {
  return pages.flatMap((p, i) =>
    p.lines
      .map(clean)
      .reduce<string[]>((acc, l) => (acc.length && /^[a-z(]/.test(l) && !/[.!?:]$/.test(acc.at(-1)!) ? [...acc.slice(0, -1), `${acc.at(-1)} ${l}`] : [...acc, l]), [])
      .flatMap((block) => block.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
      .map((s) => ({ s: s.trim(), page: i + 1 }))
      .filter(({ s }) => s.length >= 25 && s.length <= 320 && /[a-z]{3}/.test(s)),
  ).filter((x, i, all) => all.findIndex((y) => y.s === x.s) === i) // repeated boilerplate counts once
}

export function analyzeDocument(pages: Page[], name = ""): Analysis {
  // Fields: "Label: value" lines, and two-cell rows ("Label<gap>value") whose value has a digit.
  const fields: Field[] = []
  pages.forEach((p, i) =>
    p.lines.forEach((line) => {
      const cells = line.split("\t").map((c) => c.trim()).filter(Boolean)
      for (const cell of cells) {
        const m = cell.match(/^([A-Za-z][\w /().,&%#'’-]{1,60}?)\s*[:：]\s*(\S.{0,200})$/)
        if (m && !/^https?$/i.test(m[1])) fields.push({ ...splitUnit(m[1].trim(), m[2].trim()), page: i + 1 })
      }
      if (cells.length === 2 && !cells[0].includes(":") && /^[A-Za-z][^\d]{1,60}$/.test(cells[0]) && /\d/.test(cells[1]))
        fields.push({ ...splitUnit(cells[0], cells[1]), page: i + 1 })
    }),
  )

  // Tables: 3+ consecutive lines with 3+ cells and a similar column count.
  const tables: Table[] = []
  pages.forEach((p, i) => {
    let run: string[][] = []
    const flush = () => {
      if (run.length >= 3) {
        const width = Math.max(...run.map((r) => r.length))
        tables.push({ page: i + 1, rows: run.map((r) => [...r, ...Array(width - r.length).fill("")]) })
      }
      run = []
    }
    for (const line of p.lines) {
      const cells = line.split("\t").map((c) => c.trim())
      if (cells.length >= 3 && (!run.length || Math.abs(cells.length - run[0].length) <= 1)) run.push(cells)
      else {
        flush()
        if (cells.length >= 3) run.push(cells)
      }
    }
    flush()
  })

  const text = pages.map((p) => p.lines.join("\n")).join("\n")
  const identifiers: Found[] = [
    ...extractImos(text).map((imo) => {
      const pi = pages.findIndex((p) => p.lines.some((l) => l.includes(imo)))
      return { kind: "IMO", value: imo, context: ctx(pages[pi].lines.find((l) => l.includes(imo))!), page: pi + 1 }
    }),
    ...IDS.flatMap(([kind, re]) => findAll(pages, [re], kind)),
  ]
  const dates = findAll(pages, DATE_RES, "Date")
  const figures = [...findAll(pages, AMOUNT_RES, "Amount"), ...findAll(pages, [QTY_RE], "Quantity")]

  const all = sentences(pages)
  const actions = all.filter(({ s }) => ACTION_WORDS.test(s)).slice(0, 8)
  const keyPoints = all
    .map((x, i) => ({ ...x, i, score: (KEY_WORDS.test(x.s) ? 2 : 0) + (/\d/.test(x.s) ? 1 : 0) + (i < 5 ? 1 : 0) }))
    .filter((x) => x.score >= 2 && !actions.some((a) => a.s === x.s))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 6)
    .sort((a, b) => a.i - b.i)
  // Key-value pairs that read like a result (totals, amounts, emissions) are key points even without sentences.
  const keyFields = fields.filter((f) => KEY_WORDS.test(f.label)).slice(0, 8)

  const head = pages[0]?.lines.map(clean).filter((l) => l.length >= 4 && /[A-Za-z]{3}/.test(l)) ?? []
  const docType = DOC_TYPES.find(([re]) => re.test(name) || re.test(head.slice(0, 15).join(" ")))?.[1] ?? DOC_TYPES.find(([re]) => re.test(text))?.[1]

  return {
    summary: {
      title: head.find((l) => l.length <= 90 && !/^page \d/i.test(l)),
      docType,
      keyPoints: [...keyFields.map((f) => `${f.label}: ${f.value}${f.unit && !f.value.includes(f.unit) ? " " + f.unit : ""}`), ...keyPoints.map((x) => x.s)].slice(0, 10),
      actions: actions.map((x) => x.s),
      dates: dates.slice(0, 8),
      figures: [...figures.filter((f) => f.kind === "Amount"), ...figures.filter((f) => f.kind !== "Amount")].slice(0, 10),
      parties: fields.filter((f) => PARTY.test(f.label)).slice(0, 6),
    },
    data: { fields, tables, identifiers, dates, figures },
  }
}

/** Everything as plain text, for "Copy all": labels, units and pages kept, tables tab-separated (pastes into Excel). */
export function analysisText(a: Analysis, part: "summary" | "data") {
  const found = (xs: Found[]) => xs.map((x) => `- ${x.kind}: ${x.value} (p.${x.page}) — ${x.context}`)
  if (part === "summary") {
    const s = a.summary
    return [
      s.title && `Title: ${s.title}`,
      s.docType && `Type: ${s.docType}`,
      s.parties.length && ["Parties:", ...s.parties.map((f) => `- ${f.label}: ${f.value}`)].join("\n"),
      s.keyPoints.length && ["Key points:", ...s.keyPoints.map((k) => `- ${k}`)].join("\n"),
      s.actions.length && ["Action items:", ...s.actions.map((k) => `- ${k}`)].join("\n"),
      s.dates.length && ["Dates:", ...found(s.dates)].join("\n"),
      s.figures.length && ["Figures:", ...found(s.figures)].join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n")
  }
  const d = a.data
  return [
    d.fields.length && ["Fields:", ...d.fields.map((f) => `${f.label}\t${f.value}\t${f.unit ?? ""}\tp.${f.page}`)].join("\n"),
    d.identifiers.length && ["Identifiers:", ...found(d.identifiers)].join("\n"),
    d.dates.length && ["Dates:", ...found(d.dates)].join("\n"),
    d.figures.length && ["Figures:", ...found(d.figures)].join("\n"),
    ...d.tables.map((t, i) => [`Table ${i + 1} (p.${t.page}):`, ...t.rows.map((r) => r.join("\t"))].join("\n")),
  ]
    .filter(Boolean)
    .join("\n\n")
}
