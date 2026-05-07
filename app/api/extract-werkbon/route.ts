import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { transcriptie } = await request.json()
    if (!transcriptie) return NextResponse.json({ fout: 'Geen transcriptie meegestuurd.' }, { status: 400 })

    // Materiaalbibliotheek ophalen
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let bibliotheekTekst = 'Geen materialen in bibliotheek.'
    if (user) {
      const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
      if (bedrijf) {
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
      max_tokens: 1024,
      system: `Je bent een assistent die Nederlandse vakmensen (loodgieters en elektriciens) helpt hun werk te administreren.
Je krijgt een gesproken beschrijving van een klus en zet die om naar een gestructureerde werkbon in JSON.

De vakman heeft de volgende materiaalbibliotheek:
${bibliotheekTekst}

Probeer elk materiaal dat in de transcriptie wordt genoemd te matchen met de bibliotheek.
Gebruik hierbij flexibel taalgebruik: "stopcontact" kan overeenkomen met "stopcontact wit".

Voor elk materiaal geef je:
- "bibliotheek_id": het id uit de bibliotheek als je een match hebt gevonden, anders null
- "match_zekerheid": "hoog" (duidelijke match), "laag" (onzeker), of "geen" (niet gevonden)
- "prijs": prijs uit bibliotheek als gematcht, anders null
- "twijfel_reden": alleen invullen bij "laag" of "geen"

Maximaal 2 materialen mogen "laag" of "geen" als match_zekerheid hebben in je antwoord — kies de meest onduidelijke.

Geef ALLEEN geldige JSON terug, geen uitleg of tekst erbuiten.

JSON formaat:
{
  "omschrijving": "Korte omschrijving van de klus",
  "uren": 0.0,
  "materialen": [
    {
      "naam": "materiaalnaam",
      "aantal": 1,
      "eenheid": "stuk",
      "prijs": 6.50,
      "bibliotheek_id": "uuid-of-null",
      "match_zekerheid": "hoog",
      "twijfel_reden": null
    }
  ],
  "voorrijkosten_meenemen": true,
  "twijfels": []
}`,
      messages: [{ role: 'user', content: `Maak een werkbon van deze transcriptie:\n\n${transcriptie}` }],
    })

    const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
    const schone_tekst = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const werkbon = JSON.parse(schone_tekst)

    return NextResponse.json({ werkbon })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `Werkbon maken mislukt: ${bericht}` }, { status: 500 })
  }
}
