// IMO ship identification number: 7 digits, last one is a check digit.
// Check digit = (d1*7 + d2*6 + d3*5 + d4*4 + d5*3 + d6*2) mod 10.
// Used to reject hallucinated / mistyped IMOs in extraction and search.

export function imoCheckDigit(first6: string): number {
  return [...first6].reduce((sum, d, i) => sum + Number(d) * (7 - i), 0) % 10
}

export function isValidImo(value: string): boolean {
  const digits = value.replace(/^IMO\s*/i, "").trim()
  return /^\d{7}$/.test(digits) && imoCheckDigit(digits.slice(0, 6)) === Number(digits[6])
}

/** Builds a valid IMO from 6 digits (test helper). */
export function makeImo(first6: string): string {
  return first6 + imoCheckDigit(first6)
}

/** Finds every valid IMO number mentioned in free text. */
export function extractImos(text: string): string[] {
  return [...new Set(text.match(/\b\d{7}\b/g) ?? [])].filter(isValidImo)
}
