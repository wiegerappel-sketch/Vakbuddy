import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { transcriptie } = await request.json()
    if (!transcriptie) return NextResponse.json({ fout: 'Geen transcriptie.' }, { status: 400 })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Je bent een assistent die een Nederlandse zelfstandige vakman helpt zijn account in te stellen.
Je krijgt een transcriptie van een spraakmemo. Haal alle relevante velden eruit en geef ze terug als strikt geldige JSON.
Als een veld niet wordt genoemd, zet null. Als iemand een getal corrigeert, gebruik het laatste genoemde getal.

Geef ALLEEN geldige JSON terug:
{
  "bedrijf": {
    "naam": "Bedrijfsnaam of null",
    "telefoon": "telefoonnummer of null",
    "email": "emailadres of null",
    "adres": "adres of null"
  },
  "tarieven": {
    "uurloon": 0.0,
    "voorrijkosten": 0.0,
    "btw_percentage": 21
  },
  "gevonden": ["naam", "uurloon"],
  "ontbrekend_kritisch": ["kvk", "btw_nummer", "iban"]
}

Zet in "gevonden" alleen velden die daadwerkelijk in de transcriptie worden genoemd.
"ontbrekend_kritisch" zijn altijd: kvk, btw_nummer, iban — tenzij ze toch worden genoemd (onwaarschijnlijk via stem).`,
      messages: [{ role: 'user', content: transcriptie }],
    })

    const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
    const schoon = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const extractie = JSON.parse(schoon)

    return NextResponse.json({ extractie })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `Extractie mislukt: ${bericht}` }, { status: 500 })
  }
}
