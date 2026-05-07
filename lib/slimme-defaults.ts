import type { SupabaseClient } from '@supabase/supabase-js'

export type SlimmeDefaults = {
  aantal_mensen?: { waarde: number; percentage: number }
  klant_type?: { waarde: string; percentage: number }
}

const DREMPEL = 0.70 // 70% minimum om als default te tonen

export async function haalSlimmeDefaults(
  supabase: SupabaseClient,
  bedrijfId: string,
): Promise<SlimmeDefaults> {
  const { data: klussen } = await supabase
    .from('klussen')
    .select('werkbon_json, klanten!klant_id(type_klant)')
    .eq('bedrijf_id', bedrijfId)
    .in('status', ['compleet', 'gefactureerd', 'betaald'])
    .order('datum', { ascending: false })
    .limit(50)

  if (!klussen || klussen.length < 3) return {}

  const defaults: SlimmeDefaults = {}

  // ─── aantal_mensen ────────────────────────────────────────────────────────
  const aantalMensenWaarden = klussen
    .map((k) => {
      const wb = k.werkbon_json as Record<string, unknown> | null
      const val = wb?.aantal_mensen
      return typeof val === 'number' ? val : null
    })
    .filter((v): v is number => v !== null)

  if (aantalMensenWaarden.length >= 3) {
    const teller: Record<number, number> = {}
    for (const v of aantalMensenWaarden) teller[v] = (teller[v] ?? 0) + 1
    const meest = Object.entries(teller).sort((a, b) => b[1] - a[1])[0]
    const percentage = meest[1] / aantalMensenWaarden.length
    if (percentage >= DREMPEL) {
      defaults.aantal_mensen = { waarde: Number(meest[0]), percentage }
    }
  }

  // ─── klant_type ───────────────────────────────────────────────────────────
  const typeWaarden = klussen
    .map((k) => {
      const klant = (k.klanten as unknown) as { type_klant: string | null } | null
      return klant?.type_klant ?? null
    })
    .filter((v): v is string => v !== null && v !== '')

  if (typeWaarden.length >= 3) {
    const teller: Record<string, number> = {}
    for (const v of typeWaarden) teller[v] = (teller[v] ?? 0) + 1
    const meest = Object.entries(teller).sort((a, b) => b[1] - a[1])[0]
    const percentage = meest[1] / typeWaarden.length
    if (percentage >= DREMPEL) {
      defaults.klant_type = { waarde: meest[0], percentage }
    }
  }

  return defaults
}

export function pctLabel(percentage: number): string {
  return `${Math.round(percentage * 100)}% van je klussen`
}
