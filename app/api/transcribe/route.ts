import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioBestand = formData.get('audio') as File

    if (!audioBestand) {
      return NextResponse.json({ fout: 'Geen audiobestand meegestuurd.' }, { status: 400 })
    }

    const transcriptie = await openai.audio.transcriptions.create({
      file: audioBestand,
      model: 'whisper-1',
      language: 'nl',
    })

    return NextResponse.json({ tekst: transcriptie.text })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    console.error('Transcriptie fout:', bericht)
    return NextResponse.json({ fout: `Transcriptie mislukt: ${bericht}` }, { status: 500 })
  }
}
