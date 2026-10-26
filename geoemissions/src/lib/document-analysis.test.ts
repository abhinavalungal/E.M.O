// Run: node --test src/lib/document-analysis.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { analysisText, analyzeDocument, type Page } from "./document-analysis.ts"

const INVOICE: Page[] = [
  {
    lines: [
      "Invoice",
      "Aither Group AG",
      "Bill to: GEOSERVE ENERGY TRANSPORT FZCO",
      "Invoice number: 2025-001699-A\tDate: 17/12/2025",
      "Item\tQty\tUnit price\tAmount",
      "EUA transfer fee\t2\tEUR 1,250.00\tEUR 2,500.00",
      "Registry service\t1\tEUR 300.00\tEUR 300.00",
      "VAT\t1\tEUR 0.00\tEUR 0.00",
      "Total amount due\tEUR 2,800.00",
      "Please remit payment no later than 16 January 2026 quoting the invoice number.",
    ],
  },
]

const BDN: Page[] = [
  {
    ocr: true,
    lines: [
      "BUNKER DELIVERY NOTE",
      "Vessel: MV Navi Moon IMO 9385154",
      "BDN No: AE214010",
      "Port: ABIDJAN",
      "Delivery date: 12-10-2026",
      "Product: VLSFO",
      "Quantity (MT): 219.998",
      "Density at 15C: 0.9481 kg/l",
      "Sulphur content: 0.48 %",
      "The master must retain this note on board for three years and provide a sample on request.",
    ],
  },
]

test("invoice: fields keep labels and units, tables come out as rows, amounts and actions are found", () => {
  const a = analyzeDocument(INVOICE, "1699.(17-12-2025) GEOSERVE.pdf")
  assert.equal(a.summary.docType, "Invoice")
  assert.equal(a.summary.title, "Invoice")
  assert.deepEqual(a.summary.parties.map((f) => [f.label, f.value]), [["Bill to", "GEOSERVE ENERGY TRANSPORT FZCO"]])
  assert.ok(a.data.fields.some((f) => f.label === "Invoice number" && f.value === "2025-001699-A"))
  assert.ok(a.data.fields.some((f) => f.label === "Total amount due" && f.value === "EUR 2,800.00"))
  assert.deepEqual(a.data.tables[0].rows[0], ["Item", "Qty", "Unit price", "Amount"])
  assert.equal(a.data.tables[0].rows.length, 4)
  assert.ok(a.data.figures.some((f) => f.kind === "Amount" && f.value === "EUR 2,800.00"))
  assert.deepEqual(a.data.dates.map((d) => d.value), ["17/12/2025", "16 January 2026"])
  assert.match(a.summary.actions[0], /^Please remit payment/)
  assert.ok(a.summary.keyPoints.some((k) => k === "Total amount due: EUR 2,800.00"))
})

test("scanned BDN: identifiers (valid IMO, BDN no.), unit from the label, quantities with units", () => {
  const a = analyzeDocument(BDN, "BDN of VLSFO.pdf")
  assert.equal(a.summary.docType, "Bunker delivery note")
  const ids = a.data.identifiers.map((x) => [x.kind, x.value])
  assert.ok(ids.some(([k, v]) => k === "IMO" && v === "9385154"))
  assert.ok(ids.some(([k, v]) => k === "BDN no." && v === "AE214010"))
  assert.deepEqual(a.data.fields.find((f) => f.label === "Quantity"), { label: "Quantity", value: "219.998", unit: "MT", page: 1 })
  assert.ok(a.data.figures.some((f) => f.value === "0.48 %"))
  assert.match(a.summary.actions[0], /must retain/)
})

test("label words are not identifiers; repeated sentences count once", () => {
  const page = { lines: ["Please enter the BDN Number and BDN Quantity in the form.", "Invoice Date: 17/12/2025", "Please enter the BDN Number and BDN Quantity in the form."] }
  const a = analyzeDocument([page])
  assert.deepEqual(a.data.identifiers, [])
  assert.equal(a.summary.actions.length, 1)
})

test("copy-all text keeps labels, units, pages; tables are tab-separated; empty input is safe", () => {
  const a = analyzeDocument(INVOICE)
  const data = analysisText(a, "data")
  assert.match(data, /Invoice number\t2025-001699-A\t\tp\.1/)
  assert.match(data, /Table 1 \(p\.1\):\nItem\tQty\tUnit price\tAmount/)
  assert.match(analysisText(a, "summary"), /Action items:\n- Please remit/)
  const empty = analyzeDocument([{ lines: [] }])
  assert.deepEqual([empty.data.fields, empty.data.tables, empty.summary.keyPoints], [[], [], []])
  assert.equal(analysisText(empty, "data"), "")
})
