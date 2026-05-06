import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { maakFactuurPdf } from '@/lib/maakFactuurPdf'

export async function POST(request: NextRequest) {
  try {
    const { klus_id, factuur_id } = await request.json()
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 })

    // Bestaande factuur opnieuw downloaden
    if (factuur_id) {
      const { data: factuur } = await supabase.from('facturen').select('klus_id, factuurnummer').eq('id', factuur_id).single()
      if (!factuur) return NextResponse.json({ fout: 'Factuur niet gevonden.' }, { status: 404 })
      const { pdf } = await maakFactuurPdf(factuur.klus_id, supabase, factuur.factuurnummer)
      return new NextResponse(pdf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="factuur-${factuur.factuurnummer}.pdf"`,
        },
      })
    }

    // Nieuwe factuur aanmaken
    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
    if (!bedrijf) return NextResponse.json({ fout: 'Geen bedrijf gevonden.' }, { status: 400 })

    const { pdf, factuurnummer, totaalExclBtw, btwBedrag, totaalInclBtw } = await maakFactuurPdf(klus_id, supabase)

    await supabase.from('facturen').insert({
      klus_id,
      bedrijf_id: bedrijf.id,
      factuurnummer,
      totaal_excl_btw: totaalExclBtw,
      btw_bedrag: btwBedrag,
      totaal_incl_btw: totaalInclBtw,
    })

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="factuur-${factuurnummer}.pdf"`,
      },
    })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `PDF maken mislukt: ${bericht}` }, { status: 500 })
  }
}
