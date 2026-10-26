// Document processing: file bytes -> pages of text lines -> analysis. Server only; nothing leaves this machine.
// Add a file type by adding an extractor to EXTRACTORS; analysis is shared (src/lib/document-analysis.ts).
import "server-only"
import { existsSync } from "node:fs"
import path from "node:path"
import { analyzeDocument, type Analysis, type Page } from "./document-analysis"

export type DocumentResult = Analysis & {
  name: string
  kind: string
  pages: number
  ocrPages: number[]
  ocrConfidence?: number // mean Tesseract confidence (0-100) over OCR'd pages
  text: string
  warnings: string[]
}
type Extracted = { pages: Page[]; confidences: number[]; warnings: string[] }

const MIN_TEXT = 40 // fewer characters than this on a PDF page = a scan; OCR it
const MAX_PAGES = 60 // ponytail: larger documents are cut at 60 pages; page through them when users need more

// English model shipped in node_modules (@tesseract.js-data/eng): no download, works offline. Resolved from disk,
// not require.resolve, because the bundler rewrites module paths. npm runs the app from the package folder.
const LANG_PATH = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int")
const OCR_TIMEOUT_MS = 30_000 // per page

async function ocr(images: Buffer[]) {
  if (!existsSync(path.join(LANG_PATH, "eng.traineddata.gz"))) throw new Error(`OCR model missing at ${LANG_PATH}: run npm install`)
  const { createWorker } = await import("tesseract.js")
  // Tesseract reports some failures only through errorHandler; without it a broken worker hangs the request.
  let fail: (e: unknown) => void = () => {}
  const failed = new Promise<never>((_, reject) => (fail = reject))
  const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timed out")), ms))
  const worker = await Promise.race([createWorker("eng", 1, { langPath: LANG_PATH, cacheMethod: "none", gzip: true, errorHandler: fail }), failed, timeout(OCR_TIMEOUT_MS)])
  try {
    const out = []
    for (const img of images) {
      const { data } = await Promise.race([worker.recognize(img), failed, timeout(OCR_TIMEOUT_MS)])
      out.push({ lines: data.text.split("\n").filter((l) => l.trim()), confidence: data.confidence })
    }
    return out
  } finally {
    await worker.terminate().catch(() => {})
  }
}

/** Text items -> lines, by baseline; a gap wider than ~2 characters becomes "\t" so columns survive. */
function toLines(items: { str: string; transform: number[]; width: number; height: number }[]) {
  const rows = new Map<number, typeof items>()
  for (const it of items) {
    if (!it.str.trim()) continue
    const y = Math.round(it.transform[5] / 3) // items within ~3pt share a line
    rows.set(y, [...(rows.get(y) ?? []), it])
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // PDF y grows upwards
    .map(([, row]) => {
      row.sort((a, b) => a.transform[4] - b.transform[4])
      let line = "", end = -Infinity
      for (const it of row) {
        const gap = it.transform[4] - end, ch = Math.max(it.height, 6) * 0.5
        line += end === -Infinity ? "" : gap > ch * 4 ? "\t" : gap > ch * 0.2 && !line.endsWith(" ") && !it.str.startsWith(" ") ? " " : ""
        line += it.str
        end = it.transform[4] + it.width
      }
      return line.trim()
    })
    .filter(Boolean)
}

async function pdf(bytes: Uint8Array): Promise<Extracted> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const task = getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 })
  const doc = await task.promise
  // In Node, pdf.js renders through @napi-rs/canvas; the factory is untyped.
  const canvases = doc.canvasFactory as { create(w: number, h: number): { canvas: HTMLCanvasElement & { toBuffer(t: "image/png"): Buffer }; context: CanvasRenderingContext2D } }
  const warnings = doc.numPages > MAX_PAGES ? [`Only the first ${MAX_PAGES} of ${doc.numPages} pages were processed.`] : []
  const pages: Page[] = []
  const scans: { index: number; png: Buffer }[] = []
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const lines = toLines((await page.getTextContent()).items as Parameters<typeof toLines>[0])
      pages.push({ lines })
      if (lines.join("").length < MIN_TEXT) {
        const viewport = page.getViewport({ scale: 2 }) // ~150 dpi: enough for Tesseract on typical scans
        const { canvas, context } = canvases.create(viewport.width, viewport.height)
        await page.render({ canvasContext: context, canvas, viewport }).promise
        scans.push({ index: n - 1, png: canvas.toBuffer("image/png") })
      }
    }
  } finally {
    await task.destroy()
  }
  const confidences: number[] = []
  if (scans.length) {
    const results = await ocr(scans.map((s) => s.png))
    scans.forEach((s, i) => {
      pages[s.index] = { lines: results[i].lines, ocr: true }
      confidences.push(results[i].confidence)
    })
  }
  return { pages, confidences, warnings }
}

async function image(bytes: Uint8Array): Promise<Extracted> {
  const [r] = await ocr([Buffer.from(bytes)])
  return { pages: [{ lines: r.lines, ocr: true }], confidences: [r.confidence], warnings: [] }
}

const lines = (bytes: Uint8Array) => new TextDecoder().decode(bytes).split(/\r?\n/)
const text = async (bytes: Uint8Array): Promise<Extracted> => ({ pages: [{ lines: lines(bytes) }], confidences: [], warnings: [] })
// ponytail: naive CSV split (no quoted commas); use a CSV parser if quoted fields show up
const csv = async (bytes: Uint8Array): Promise<Extracted> => ({ pages: [{ lines: lines(bytes).map((l) => l.replace(/[,;]/g, "\t")) }], confidences: [], warnings: [] })

const EXTRACTORS: [RegExp, string, (b: Uint8Array) => Promise<Extracted>][] = [
  [/^application\/pdf$|\.pdf$/i, "pdf", pdf],
  [/^image\/(png|jpe?g|tiff|bmp|gif|webp)$|\.(png|jpe?g|tiff?|bmp|gif|webp)$/i, "image", image],
  [/^text\/csv$|\.csv$/i, "csv", csv],
  [/^text\/plain$|\.txt$/i, "text", text],
]

export const canProcess = (name: string, contentType = "") => EXTRACTORS.some(([re]) => re.test(contentType) || re.test(name))

export async function processDocument(bytes: Uint8Array, name: string, contentType = ""): Promise<DocumentResult> {
  const match = EXTRACTORS.find(([re]) => re.test(contentType) || re.test(name))
  if (!match) throw Object.assign(new Error(`Can't read ${name}: supported types are PDF, images and text/CSV.`), { status: 415 })
  const [, kind, extract] = match
  const { pages, confidences, warnings } = await extract(bytes)
  const ocrPages = pages.flatMap((p, i) => (p.ocr ? [i + 1] : []))
  const ocrConfidence = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : undefined
  if (!pages.some((p) => p.lines.length)) warnings.push("No text could be read from this file.")
  else if (ocrConfidence !== undefined && ocrConfidence < 60) warnings.push(`Scanned pages were hard to read (OCR confidence ${ocrConfidence}%). Check values against the original.`)
  return {
    name,
    kind,
    pages: pages.length,
    ocrPages,
    ocrConfidence,
    text: pages.map((p, i) => `--- Page ${i + 1}${p.ocr ? " (OCR)" : ""} ---\n${p.lines.map((l) => l.replace(/\t/g, "    ")).join("\n")}`).join("\n\n"),
    warnings,
    ...analyzeDocument(pages, name),
  }
}
