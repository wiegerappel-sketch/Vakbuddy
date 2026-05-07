import type { Klant } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchKandidaat = {
  klant: Klant
  score: number       // 0.0 – 1.0
  methode: 'exact' | 'fuzzy'
}

export type MatchResultaat =
  | { type: 'exact';    match: MatchKandidaat }
  | { type: 'fuzzy';    match: MatchKandidaat }
  | { type: 'meerdere'; kandidaten: MatchKandidaat[] }  // 2+ vergelijkbaar goede fuzzy matches
  | { type: 'geen' }

// ─── Naam normalisatie ────────────────────────────────────────────────────────

const PREFIXEN = [
  'familie ', 'fam. ', 'fam ',
  'de heer ', 'dhr. ', 'dhr ',
  'mevrouw ', 'mevr. ', 'mevr ',
  'de firma ', 'firma ',
  'het bedrijf ',
]

export function normaliseerNaam(naam: string): string {
  let n = naam.toLowerCase().trim()
  for (const prefix of PREFIXEN) {
    if (n.startsWith(prefix)) {
      n = n.slice(prefix.length).trim()
      break
    }
  }
  // Meerdere spaties samenvoegen
  return n.replace(/\s+/g, ' ')
}

// ─── Similarity (Dice coefficient op bigrams) ─────────────────────────────────
// Keuze voor Dice/bigrams: goed op namen, robuust voor typefouten en variaties.

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2))
  }
  return set
}

export function similarity(a: string, b: string): number {
  const na = normaliseerNaam(a)
  const nb = normaliseerNaam(b)
  if (na === nb) return 1.0
  if (na.length < 2 || nb.length < 2) return 0.0

  const ba = bigrams(na)
  const bb = bigrams(nb)
  let overlap = 0
  for (const bi of ba) {
    if (bb.has(bi)) overlap++
  }
  return (2 * overlap) / (ba.size + bb.size)
}

// ─── Kern matching-functie ────────────────────────────────────────────────────

const DREMPEL_EXACT  = 1.0   // score na normalisatie gelijk
const DREMPEL_HOOG   = 0.75  // duidelijke fuzzy match → automatisch koppelen
const DREMPEL_LAAG   = 0.45  // zwakke match → aan gebruiker vragen

export function matchKlantInLijst(
  gezochteNaam: string,
  gezoechtePlaats: string | null | undefined,
  klanten: Klant[],
): MatchResultaat {
  if (!gezochteNaam.trim() || klanten.length === 0) return { type: 'geen' }

  const plaatsNorm = gezoechtePlaats ? normaliseerNaam(gezoechtePlaats) : null

  const kandidaten: MatchKandidaat[] = klanten
    .map((klant) => {
      const naamScore = similarity(gezochteNaam, klant.naam)
      const plaatsMatch = plaatsNorm && klant.plaats && normaliseerNaam(klant.plaats) === plaatsNorm
      const methode: 'exact' | 'fuzzy' =
        normaliseerNaam(gezochteNaam) === normaliseerNaam(klant.naam) ? 'exact' : 'fuzzy'

      // Kleine bonus als plaats overeenkomt
      const score = plaatsMatch ? Math.min(1.0, naamScore + 0.1) : naamScore

      return { klant, score, methode, plaatsMatch: !!plaatsMatch, naamScore }
    })
    .filter((k) => k.score >= DREMPEL_LAAG)
    .sort((a, b) => b.score - a.score) as (MatchKandidaat & { plaatsMatch: boolean; naamScore: number })[]

  if (kandidaten.length === 0) return { type: 'geen' }

  const beste = kandidaten[0] as MatchKandidaat & { plaatsMatch: boolean; naamScore: number }

  // Exacte naam-match gevonden
  if (beste.methode === 'exact') {
    // Als er een gezochte plaats is die NIET overeenkomt én een andere kandidaat wél de
    // juiste plaats heeft → toon meerdere opties zodat de vakman kan kiezen
    if (plaatsNorm && !beste.plaatsMatch) {
      const metPlaats = kandidaten.filter((k) => k.plaatsMatch)
      if (metPlaats.length > 0) {
        return { type: 'meerdere', kandidaten: [beste, ...metPlaats].slice(0, 5) }
      }
    }
    return { type: 'exact', match: beste }
  }

  // Duidelijke fuzzy match zonder ambiguïteit
  if (beste.score >= DREMPEL_HOOG) {
    const tweede = kandidaten[1] as (MatchKandidaat & { naamScore: number }) | undefined
    if (!tweede || beste.score - tweede.score > 0.15) {
      return { type: 'fuzzy', match: beste }
    }
  }

  // Meerdere vergelijkbaar goede kandidaten → gebruiker laten kiezen
  const vergelijkbaar = kandidaten.filter((k) => beste.score - k.score <= 0.15)
  if (vergelijkbaar.length > 1) {
    return { type: 'meerdere', kandidaten: vergelijkbaar.slice(0, 5) }
  }

  if (kandidaten.length >= 1) {
    return { type: 'fuzzy', match: beste }
  }

  return { type: 'geen' }
}

// ─── Supabase-wrapper ─────────────────────────────────────────────────────────
// Dynamische import zodat dit bestand ook buiten Next.js (test, scripts) werkt.

export async function matchKlant(
  bedrijfId: string,
  gezochteNaam: string,
  gezoechtePlaats?: string | null,
): Promise<MatchResultaat> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: klanten } = await supabase
    .from('klanten')
    .select('*')
    .eq('bedrijf_id', bedrijfId)
    .order('naam')

  return matchKlantInLijst(gezochteNaam, gezoechtePlaats, klanten ?? [])
}
