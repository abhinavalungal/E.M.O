// Run: node --test src/lib/imo.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { extractImos, isValidImo, makeImo } from "./imo.ts"

test("known valid IMO numbers pass", () => {
  assert.ok(isValidImo("9074729")) // textbook example
  assert.ok(isValidImo("IMO 9074729"))
})

test("wrong check digit, wrong length and letters fail", () => {
  assert.ok(!isValidImo("9074728"))
  assert.ok(!isValidImo("907472"))
  assert.ok(!isValidImo("90747290"))
  assert.ok(!isValidImo("90747a9"))
})

test("makeImo produces valid numbers and extractImos filters invalid ones", () => {
  const imo = makeImo("931245")
  assert.ok(isValidImo(imo))
  assert.deepEqual(extractImos(`BDN for IMO ${imo}, ref 1234568, voyage 2026-114`), [imo])
})
