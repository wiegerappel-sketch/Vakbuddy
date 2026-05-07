import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

type Regel = {
  omschrijving: string
  artikelnummer: string | null
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
    const { bestand_id } = await request.json()
    if (!bestand_id) return NextResponse.json({ fout: 'Geen bestand_id.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 })

    // Haal bestand op
    const { data: bestand } = await supabase
      .from('upload_bestanden')
      .select('id, bestandsnaam, storage_path, type, batch_id')
      .eq('id', bestand_id)
      .single()

    if (!bestand?.storage_path) {
      return NextResponse.json({ fout: 'Bestand niet gevonden of nog niet geüpload.' }, { status: 404 })
    }

    // Markeer als bezig
    await supabase.from('upload_bestanden').update({ classificatie: 'bezig' }).eq('id', bestand_id)

    // Download van Storage via service-role (private bucket)
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: blob, error: downloadError } = await service.storage
      .from('inkoopfacturen')
      .download(bestand.storage_path)

    if (downloadError || !blob) {
      await supabase.from('upload_bestanden').update({ classificatie: 'fout', fout_melding: downloadError?.message ?? 'Download mislukt' }).eq('id', bestand_id)
      return NextResponse.json({ fout: 'Downloaden mislukt.' }, { status: 500 })
    }

    const buffer = await blob.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const isAfbeelding = bestand.type !== 'pdf'
    const mediaType = isAfbeelding ? 'image/jpeg' : 'application/pdf'

    // Claude: classificatie + extractie in één call
    const contentBlocks: ContentBlockParam[] = [
      isAfbeelding
        ? { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as ContentBlockParam,
      {
        type: 'text',
        text: `Lees dit document uit.

Bepaal eerst: is dit een inkoopfactuur (aankoop van materialen bij een leverancier)?
Als het GEEN inkoopfactuur is, geef terug: {"classificatie": "geen_factuur", "reden": "..."}

Als het WEL een inkoopfactuur is, geef terug:
{
  "classificatie": "inkoopfactuur",
  "leverancier": "naam leverancier",
  "factuurdatum": "YYYY-MM-DD",
  "regels": [
    {
      "omschrijving": "naam materiaal",
      "artikelnummer": "1234567" of null,
      "aantal": 2,
      "eenheid": "stuk",
      "prijs_per_eenheid": 4.50
    }
  ]
}

Regels voor de regels:
- Alleen fysieke materialen — geen transport, korting, BTW, service
- Artikelnummer invullen als zichtbaar op de factuur
- Prijzen zijn altijd excl. BTW
- Geef ALLEEN geldige JSON terug, geen uitleg`,
      },
    ]

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    })

    const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
    const schoon = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(schoon) as { classificatie: string; reden?: string } & Partial<UitleesResultaat>

    if (parsed.classificatie !== 'inkoopfactuur') {
      await supabase.from('upload_bestanden').update({
        classificatie: 'overig',
        fout_melding: parsed.reden ?? 'Geen inkoopfactuur',
        verwerkt_op: new Date().toISOString(),
      }).eq('id', bestand_id)
      return NextResponse.json({ classificatie: 'overig', reden: parsed.reden })
    }

    await supabase.from('upload_bestanden').update({
      classificatie: 'inkoopfactuur',
      verwerkt_op: new Date().toISOString(),
    }).eq('id', bestand_id)

    return NextResponse.json({
      classificatie: 'inkoopfactuur',
      leverancier: parsed.leverancier,
      factuurdatum: parsed.factuurdatum,
      regels: parsed.regels ?? [],
      bestand_id,
    })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `Verwerken mislukt: ${bericht}` }, { status: 500 })
  }
}
