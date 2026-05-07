import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { VELD_LABELS } from '@/lib/werkbon-compleetheid'

const resend = new Resend(process.env.RESEND_API_KEY)

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type ConceptKlus = {
  id: string
  ontbrekende_velden: string[] | null
  klantNaam: string | null
  omschrijving: string | null
}

function klausLabel(k: ConceptKlus) {
  return k.klantNaam ?? k.omschrijving ?? 'Onbekende klus'
}

function ontbrekendLabel(k: ConceptKlus) {
  return (k.ontbrekende_velden ?? []).map((v) => VELD_LABELS[v] ?? v).join(', ')
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ fout: 'Niet geautoriseerd.' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: bedrijven } = await supabase
    .from('bedrijven')
    .select('id, naam, user_id')

  if (!bedrijven || bedrijven.length === 0) {
    return NextResponse.json({ verstuurd: 0 })
  }

  let verstuurd = 0

  for (const bedrijf of bedrijven) {
    const { data: rawConcepten } = await supabase
      .from('klussen')
      .select('id, ontbrekende_velden, klanten!klant_id(naam), werkbon_json')
      .eq('bedrijf_id', bedrijf.id)
      .eq('status', 'concept')
      .order('datum', { ascending: false })

    if (!rawConcepten || rawConcepten.length === 0) continue

    const concepten: ConceptKlus[] = rawConcepten.map((k) => ({
      id: k.id as string,
      ontbrekende_velden: k.ontbrekende_velden as string[] | null,
      klantNaam: ((k.klanten as unknown) as { naam: string } | null)?.naam ?? null,
      omschrijving: ((k.werkbon_json as unknown) as { omschrijving?: string } | null)?.omschrijving ?? null,
    }))

    const { data: userData } = await supabase.auth.admin.getUserById(bedrijf.user_id)
    const email = userData?.user?.email
    if (!email) continue

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vakbuddy.nl'
    const bedrijfNaam = (bedrijf.naam as string | null) ?? 'je bedrijf'
    const aantalLabel = `${concepten.length} werkbon${concepten.length > 1 ? 'nen' : ''}`
    const werktenWacht = concepten.length > 1 ? 'wachten' : 'wacht'

    const html = `
<p>Goedemorgen,</p>
<p>${aantalLabel} ${werktenWacht} nog op ontbrekende gegevens:</p>
<ul style="line-height:2;">
${concepten.map((k) => {
  const link = `${appUrl}/klussen/${k.id}`
  return `  <li><strong>${klausLabel(k)}</strong> — ${ontbrekendLabel(k)} &nbsp;<a href="${link}" style="color:#f97316;">Afmaken →</a></li>`
}).join('\n')}
</ul>
<p>
  <a href="${appUrl}/klussen" style="background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
    Alle concepten afmaken
  </a>
</p>`.trim()

    const text = [
      `${aantalLabel} ${werktenWacht} op gegevens:`,
      '',
      ...concepten.map((k) => `• ${klausLabel(k)} — ${ontbrekendLabel(k)}\n  ${appUrl}/klussen/${k.id}`),
      '',
      `Bekijk ze op: ${appUrl}/klussen`,
    ].join('\n')

    await resend.emails.send({
      from: 'Vakbuddy <noreply@vakbuddy.nl>',
      to: email,
      subject: `⚠️ ${aantalLabel} ${werktenWacht} op gegevens — ${bedrijfNaam}`,
      html,
      text,
    })

    verstuurd++
  }

  return NextResponse.json({ verstuurd, totaal: bedrijven.length })
}
