import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { factuur_id } = await request.json()
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 })

    const { data: factuur } = await supabase
      .from('facturen')
      .select('*, klussen(*, klanten(*))')
      .eq('id', factuur_id)
      .single()

    const { data: bedrijf } = await supabase
      .from('bedrijven')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!factuur || !bedrijf) {
      return NextResponse.json({ fout: 'Factuur of bedrijf niet gevonden.' }, { status: 404 })
    }

    const klant = factuur.klussen?.klanten as { naam: string; email: string | null } | null

    if (!klant?.email) {
      return NextResponse.json({ fout: 'Klant heeft geen e-mailadres.' }, { status: 400 })
    }

    // PDF opnieuw genereren voor de mail
    const pdfResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/factuur-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ klus_id: factuur.klus_id }),
    })

    if (!pdfResponse.ok) {
      return NextResponse.json({ fout: 'PDF genereren mislukt.' }, { status: 500 })
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()

    const { error } = await resend.emails.send({
      from: `${bedrijf.naam ?? 'Vakbuddy'} <onboarding@resend.dev>`,
      to: klant.email,
      subject: `Factuur ${factuur.factuurnummer} van ${bedrijf.naam ?? 'Vakbuddy'}`,
      html: `
        <p>Beste ${klant.naam},</p>
        <p>Bijgevoegd vindt u factuur <strong>${factuur.factuurnummer}</strong> van ${bedrijf.naam}.</p>
        <p>Totaalbedrag: <strong>€ ${Number(factuur.totaal_incl_btw).toFixed(2).replace('.', ',')}</strong></p>
        <p>Met vriendelijke groet,<br/>${bedrijf.naam}</p>
      `,
      attachments: [
        {
          filename: `factuur-${factuur.factuurnummer}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ],
    })

    if (error) {
      return NextResponse.json({ fout: 'Mail versturen mislukt: ' + error.message }, { status: 500 })
    }

    await supabase
      .from('facturen')
      .update({ verzonden_op: new Date().toISOString() })
      .eq('id', factuur_id)

    return NextResponse.json({ succes: true })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: `Fout: ${bericht}` }, { status: 500 })
  }
}
