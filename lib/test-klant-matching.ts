/**
 * Unit-test voor klant-matching logica (geen API, geen Supabase).
 *
 * Gebruik:
 *   node --experimental-strip-types lib/test-klant-matching.ts
 */

import { matchKlantInLijst, normaliseerNaam, similarity } from './klant-matching.ts'

type Klant = {
  id: string; bedrijf_id: string; naam: string
  adres: string | null; postcode: string | null; plaats: string | null
  email: string | null; telefoon: string | null
  aangemaakt_via: string | null; aangemaakt_op_klus_id: string | null
}

// ─── Testdata ─────────────────────────────────────────────────────────────────

const KLANTEN: Klant[] = [
  { id: '1', bedrijf_id: 'b1', naam: 'Familie Jansen',   adres: 'Kerkstraat 1',  postcode: null, plaats: 'Den Bosch', email: null, telefoon: null, aangemaakt_via: null, aangemaakt_op_klus_id: null },
  { id: '2', bedrijf_id: 'b1', naam: 'Henk Jansen',      adres: 'Lindenlaan 4',  postcode: null, plaats: 'Vught',     email: null, telefoon: null, aangemaakt_via: null, aangemaakt_op_klus_id: null },
  { id: '3', bedrijf_id: 'b1', naam: 'Familie Pietersen', adres: 'Brink 12',     postcode: null, plaats: 'Den Bosch', email: null, telefoon: null, aangemaakt_via: null, aangemaakt_op_klus_id: null },
  { id: '4', bedrijf_id: 'b1', naam: 'Installatiebedrijf De Vries BV', adres: null, postcode: null, plaats: 'Vught', email: null, telefoon: null, aangemaakt_via: null, aangemaakt_op_klus_id: null },
  { id: '5', bedrijf_id: 'b1', naam: 'Mevrouw De Groot',  adres: 'Hoefstraat 7', postcode: null, plaats: 'Rosmalen', email: null, telefoon: null, aangemaakt_via: null, aangemaakt_op_klus_id: null },
]

// ─── Testcases ────────────────────────────────────────────────────────────────

type TestGeval = {
  label: string
  gezocht: string
  plaats?: string
  verwacht: string   // type van MatchResultaat, of klant-id bij exact/fuzzy
}

const TESTS: TestGeval[] = [
  { label: 'Exact match na normalisatie',            gezocht: 'Familie Jansen',    verwacht: 'exact:1' },
  { label: 'Exact match met prefix gestript',        gezocht: 'fam. Pietersen',    verwacht: 'exact:3' },
  // "Jansen" normaliseert naar "jansen" = exacte match voor "Familie Jansen" (→ "jansen")
  { label: '"Jansen" zonder plaats → exacte match',  gezocht: 'Jansen',            verwacht: 'exact:1' },
  // Met Den Bosch: Familie Jansen (Den Bosch) wint; exact + kloppende plaats
  { label: '"Jansen" met Den Bosch',                 gezocht: 'Jansen', plaats: 'Den Bosch', verwacht: 'exact:1' },
  // Met Vught: Familie Jansen is exacte naam-match maar verkeerde plaats;
  // Henk Jansen heeft de juiste plaats → meerdere opties tonen
  { label: '"Jansen" met Vught → meerdere',          gezocht: 'Jansen', plaats: 'Vught', verwacht: 'meerdere' },
  { label: 'Zakelijk, lichte typefout',              gezocht: 'De Vries BV',       verwacht: 'fuzzy:4' },
  { label: 'Onbekende klant',                        gezocht: 'Van den Berg',      verwacht: 'geen' },
  // "De Groot" normaliseert naar "de groot" = exact match voor "Mevrouw De Groot" (→ "de groot")
  { label: '"De Groot" zonder prefix → exact match', gezocht: 'De Groot',          verwacht: 'exact:5' },
]

// ─── Runner ───────────────────────────────────────────────────────────────────

let geslaagd = 0
let mislukt = 0

console.log('Klant-matching unit tests\n')

for (const t of TESTS) {
  const resultaat = matchKlantInLijst(t.gezocht, t.plaats ?? null, KLANTEN)

  let gevonden: string
  if (resultaat.type === 'exact')    gevonden = `exact:${resultaat.match.klant.id}`
  else if (resultaat.type === 'fuzzy')   gevonden = `fuzzy:${resultaat.match.klant.id}`
  else if (resultaat.type === 'meerdere') gevonden = 'meerdere'
  else gevonden = 'geen'

  const ok = gevonden === t.verwacht
  if (ok) geslaagd++; else mislukt++

  const score = resultaat.type === 'exact' || resultaat.type === 'fuzzy'
    ? ` (score: ${resultaat.match.score.toFixed(2)})`
    : ''

  console.log(`${ok ? '✓' : '✗'} ${t.label}`)
  if (!ok) {
    console.log(`  verwacht: ${t.verwacht}`)
    console.log(`  gekregen: ${gevonden}${score}`)
  } else {
    console.log(`  ${gevonden}${score}`)
  }
}

console.log(`\n${geslaagd}/${TESTS.length} geslaagd${mislukt > 0 ? ` — ${mislukt} mislukt` : ''}`)

// ─── Similarity smoke test ────────────────────────────────────────────────────

console.log('\nSimilarity checks:')
const paren: [string, string, number][] = [
  ['Familie Jansen', 'Familie Jansen', 1.0],
  ['Jansen',         'Familie Jansen', 0.5],
  ['Pietersen',      'Familie Pietersen', 0.7],
  ['Van den Berg',   'Familie Jansen', 0.0],
]
for (const [a, b, min] of paren) {
  const s = similarity(a, b)
  const ok = s >= min
  console.log(`${ok ? '✓' : '?'} similarity("${a}", "${b}") = ${s.toFixed(2)} (min ${min})`)
}

// ─── Normalisatie smoke test ──────────────────────────────────────────────────

console.log('\nNormalisatie checks:')
const normTests: [string, string][] = [
  ['Familie Jansen',  'jansen'],
  ['fam. Pietersen',  'pietersen'],
  ['De heer Bakker',  'bakker'],
  ['Mevrouw De Groot', 'de groot'],
]
for (const [input, verwacht] of normTests) {
  const uitvoer = normaliseerNaam(input)
  const ok = uitvoer === verwacht
  console.log(`${ok ? '✓' : '✗'} "${input}" → "${uitvoer}"${ok ? '' : ` (verwacht: "${verwacht}")`}`)
}
