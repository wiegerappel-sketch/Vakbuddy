import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { createClient } from '@/lib/supabase/server'

type Regel = {
  omschrijving: string
  aantal: number
  eenheid: string
  prijs_per_eenheid: number
}

type UitleesResultaat = {
  leverancier: string
  factuurdatum: string
  regels: Regel[]
}

export async function POST(request: NextRequest) {
  try {
    const anthropic = new Anthropic()
    const formData = await request.formData()
    const bestand = formData.get('bestand') as File | null
    if (!bestand) return NextResponse.json({ fout: 'Geen bestand meegestuurd.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 })

    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
    if (!bedrijf) return NextResponse.json({ fout: 'Geen bedrijf gevonden.' }, { status: 400 })

    // Materiaalbibliotheek ophalen voor matching
    const { data: bibliotheek } = await supabase
      .from('materialen').select('id, naam, prijs, eenheid, inkoopprijs').eq('bedrijf_id', bedrijf.id)
    const mat = bibliotheek ?? []

    // PDF als base64
    const buffer = await bestand.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Claude leest de factuur uit
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          } as ContentBlockParam,
          {
            type: 'text',
            text: `Lees deze inkoopfactuur uit en geef een JSON terug met alle materiaalregels.
Negeer regels voor transport, korting, service of BTW — alleen fysieke materialen.

Geef ALLEEN geldige JSON terug:
{
  "leverancier": "naam van leverancier",
  "factuurdatum": "YYYY-MM-DD",
  "regels": [
    {
      "omschrijving": "naam van het materiaal",
      "aantal": 1,
      "eenheid": "stuk",
      "prijs_per_eenheid": 4.50
    }
  ]
}`,
          },
        ],
      }],
    })

    const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
    const schoon = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const resultaat = JSON.parse(schoon) as UitleesResultaat

    // Match elke regel met de bibliotheek
    const gematchteRegels = resultaat.regels.map((regel) => {
      const naam = regel.omschrijving.toLowerCase()
      const match = mat.find((m) =>
        m.naam.toLowerCase().includes(naam) || naam.includes(m.naam.toLowerCase())
      )

      let prijsVerschilPct: number | null = null
      if (match?.inkoopprijs && match.inkoopprijs > 0) {
        prijsVerschilPct = Math.abs((regel.prijs_per_eenheid - match.inkoopprijs) / match.inkoopprijs * 100)
      }

      return {
        ...regel,
        materiaal_id: match?.id ?? null,
        materiaal_naam: match?.naam ?? null,
        oude_prijs: match?.inkoopprijs ?? null,
        prijsVerschilPct,
        toepassen: prijsVerschilPct === null || prijsVerschilPct <= 40,
      }
    })

    // Inkoopfactuur opslaan
    const { data: factuur } = await supabase.from('inkoopfacturen').insert({
      bedrijf_id: bedrijf.id,
      leverancier: resultaat.leverancier,
      factuurdatum: resultaat.factuurdatum || null,
    }).select().single()

    return NextResponse.json({
      factuur_id: factuur?.id,
      leverancier: resultaat.leverancier,
      factuurdatum: resultaat.factuurdatum,
      regels: gematchteRegels,
    })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `Verwerken mislukt: ${bericht}` }, { status: 500 })
  }
}
