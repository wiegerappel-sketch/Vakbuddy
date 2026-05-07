import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { maakWerkbonEnKlantPrompt } from '@/lib/prompts/werkbon-en-klant'
import { matchKlantInLijst } from '@/lib/klant-matching'
import type { Klant } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Zet het nieuwe { waarde, zekerheid } formaat om naar het bestaande werkbon-formaat
// zodat de rest van de app geen wijzigingen nodig heeft.
function flattenWerkbon(raw: Record<string, unknown>) {
  const w = raw.werkbon as Record<string, unknown>
  return {
    omschrijving: (w?.omschrijving as { waarde?: string } | null)?.waarde ?? '',
    uren: (w?.uren as { waarde?: number } | null)?.waarde ?? 0,
    aantal_mensen: (w?.aantal_mensen as { waarde?: number } | null)?.waarde ?? 1,
    datum: (w?.datum as { waarde?: string } | null)?.waarde ?? null,
    materialen: ((w?.materialen as unknown[]) ?? []).map((m) => {
      const mat = m as Record<string, unknown>
      return {
        naam: mat.naam,
        aantal: mat.aantal,
        eenheid: mat.eenheid,
        prijs: mat.prijs,
        bibliotheek_id: mat.bibliotheek_id,
        match_zekerheid: mat.match_zekerheid,
        twijfel_reden: mat.twijfel_reden,
      }
    }),
    geen_materiaal: (w?.geen_materiaal as boolean | null) ?? false,
    voorrijkosten_meenemen: (w?.voorrijkosten_meenemen as { waarde?: boolean } | null)?.waarde ?? true,
    twijfels: (w?.twijfels as string[]) ?? [],
  }
}

export async function POST(request: NextRequest) {
  try {
    const { transcriptie, klus_id } = await request.json()
    if (!transcriptie) return NextResponse.json({ fout: 'Geen transcriptie meegestuurd.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let bibliotheekTekst = 'Geen materialen in bibliotheek.'
    let bedrijfId: string | null = null

    if (user) {
      const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
      if (bedrijf) {
        bedrijfId = bedrijf.id
        const { data: materialen } = await supabase
          .from('materialen').select('id, naam, prijs, eenheid').eq('bedrijf_id', bedrijf.id).order('naam')
        if (materialen && materialen.length > 0) {
          bibliotheekTekst = materialen
            .map((m) => `- ${m.naam} (€${m.prijs}/${m.eenheid}) [id:${m.id}]`)
            .join('\n')
        }
      }
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: maakWerkbonEnKlantPrompt(bibliotheekTekst),
      messages: [{ role: 'user', content: transcriptie }],
    })

    const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
    const schone_tekst = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const raw = JSON.parse(schone_tekst) as Record<string, unknown>

    const werkbon = flattenWerkbon(raw)

    // ── Klant matching + aanmaken ──────────────────────────────────────────────
    let klantResultaat: { type: string; klant?: Klant; kandidaten?: Klant[] } = { type: 'onbekend' }

    if (bedrijfId) {
      const rawKlant = raw.klant as Record<string, unknown> | null
      const naamWaarde = (rawKlant?.naam as { waarde?: string } | null)?.waarde ?? null
      const plaatsWaarde = (rawKlant?.adres as Record<string, unknown> | null)
        ? ((rawKlant?.adres as Record<string, unknown>)?.plaats as { waarde?: string } | null)?.waarde ?? null
        : null

      if (naamWaarde) {
        const { data: klanten } = await supabase
          .from('klanten').select('*').eq('bedrijf_id', bedrijfId).order('naam')

        const matchResultaat = matchKlantInLijst(naamWaarde, plaatsWaarde, (klanten ?? []) as Klant[])

        if (matchResultaat.type === 'exact' || matchResultaat.type === 'fuzzy') {
          const gevondenKlant = matchResultaat.match.klant
          klantResultaat = { type: matchResultaat.type, klant: gevondenKlant }

          // Klus koppelen aan gevonden klant
          if (klus_id) {
            await supabase.from('klussen').update({ klant_id: gevondenKlant.id }).eq('id', klus_id)
          }
        } else if (matchResultaat.type === 'meerdere') {
          klantResultaat = {
            type: 'meerdere',
            kandidaten: matchResultaat.kandidaten.map((k) => k.klant),
          }
        } else {
          // Geen match — nieuwe klant aanmaken
          const straatWaarde = (rawKlant?.adres as Record<string, unknown> | null)
            ? ((rawKlant?.adres as Record<string, unknown>)?.straat as { waarde?: string } | null)?.waarde ?? null
            : null
          const huisnrWaarde = (rawKlant?.adres as Record<string, unknown> | null)
            ? ((rawKlant?.adres as Record<string, unknown>)?.huisnummer as { waarde?: string } | null)?.waarde ?? null
            : null
          const postcodeWaarde = (rawKlant?.adres as Record<string, unknown> | null)
            ? ((rawKlant?.adres as Record<string, unknown>)?.postcode as { waarde?: string } | null)?.waarde ?? null
            : null

          const adresSamengevoegd = [straatWaarde, huisnrWaarde].filter(Boolean).join(' ') || null

          const typeKlantWaarde = (rawKlant?.type_klant as Record<string, unknown> | null)?.waarde as string | null ?? null

          const { data: nieuweKlant } = await supabase
            .from('klanten')
            .insert({
              bedrijf_id: bedrijfId,
              naam: naamWaarde,
              adres: adresSamengevoegd,
              postcode: postcodeWaarde,
              plaats: plaatsWaarde,
              type_klant: typeKlantWaarde,
              aangemaakt_via: 'voice',
              aangemaakt_op_klus_id: klus_id ?? null,
            })
            .select('*')
            .single()

          if (nieuweKlant) {
            klantResultaat = { type: 'nieuw', klant: nieuweKlant as Klant }
            if (klus_id) {
              await supabase.from('klussen').update({ klant_id: nieuweKlant.id }).eq('id', klus_id)
            }
          }
        }
      } else {
        klantResultaat = { type: 'naam_onbekend' }
      }
    }

    return NextResponse.json({ werkbon, klant: klantResultaat })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `Werkbon maken mislukt: ${bericht}` }, { status: 500 })
  }
}
