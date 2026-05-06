import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { transcriptie } = await request.json()

    if (!transcriptie) {
      return NextResponse.json({ fout: 'Geen transcriptie meegestuurd.' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Je bent een assistent die Nederlandse vakmensen (loodgieters en elektriciens) helpt hun werk te administreren.
Je krijgt een gesproken beschrijving van een klus en zet die om naar een gestructureerde werkbon in JSON.

Geef ALLEEN geldige JSON terug, geen uitleg of tekst erbuiten.

JSON formaat:
{
  "omschrijving": "Korte omschrijving van de klus",
  "uren": 0.0,
  "materialen": [
    { "naam": "materiaalnaam", "aantal": 1, "eenheid": "stuk" }
  ],
  "voorrijkosten_meenemen": true,
  "twijfels": ["optionele opmerkingen als iets onduidelijk was"]
}`,
      messages: [
        {
          role: 'user',
          content: `Maak een werkbon van deze transcriptie:\n\n${transcriptie}`,
        },
      ],
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
