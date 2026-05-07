import type { Klant } from '@/types'

type WerkbonData = {
  omschrijving?: string | null
  uren?: number | null
  aantal_mensen?: number | null
  materialen?: unknown[]
  geen_materiaal?: boolean
  voorrijkosten_meenemen?: boolean | null
}

export const VELD_LABELS: Record<string, string> = {
  klant_naam:          'Naam klant',
  klant_adres:         'Adres',
  klant_email:         'E-mailadres',
  klant_type:          'Type klant (particulier / zakelijk)',
  uren:                'Aantal uren',
  aantal_mensen:       'Aantal mensen',
  omschrijving:        'Omschrijving werk',
  materialen:          'Materiaal (of "geen materiaal" tikken)',
  voorrijkosten:       'Voorrijkosten (ja of nee)',
  datum:               'Datum van de klus',
}

export function checkVeldenCompleet(
  datum: string | null | undefined,
  klant: Klant | null,
  werkbon: WerkbonData | null,
): string[] {
  const ontbrekend: string[] = []

  if (!klant?.naam?.trim()) ontbrekend.push('klant_naam')
  if (!klant?.adres?.trim() || !klant?.plaats?.trim()) ontbrekend.push('klant_adres')
  if (!klant?.email?.trim()) ontbrekend.push('klant_email')
  if (!klant?.type_klant) ontbrekend.push('klant_type')

  if (!werkbon) {
    ontbrekend.push('uren', 'aantal_mensen', 'omschrijving', 'materialen')
  } else {
    if (!werkbon.uren || werkbon.uren <= 0) ontbrekend.push('uren')
    if (!werkbon.aantal_mensen || werkbon.aantal_mensen <= 0) ontbrekend.push('aantal_mensen')
    if (!werkbon.omschrijving?.trim()) ontbrekend.push('omschrijving')
    if (!werkbon.geen_materiaal && (!werkbon.materialen || werkbon.materialen.length === 0)) {
      ontbrekend.push('materialen')
    }
    if (werkbon.voorrijkosten_meenemen === null || werkbon.voorrijkosten_meenemen === undefined) {
      ontbrekend.push('voorrijkosten')
    }
  }

  if (!datum) ontbrekend.push('datum')

  return ontbrekend
}
