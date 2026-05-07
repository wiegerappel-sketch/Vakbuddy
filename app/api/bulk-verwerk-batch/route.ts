import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

export const maxDuration = 300 // 5 minuten op Vercel

const resend = new Resend(process.env.RESEND_API_KEY)

type Regel = {
  omschrijving: string
  artikelnummer: string | null
  aantal: number
  eenheid: string
  prijs_per_eenheid: number
}

async function verwerkEenBestand(
  service: SupabaseClient,
  bestandId: string,
  storagePath: string,
  bestandType: string,
  anthropic: Anthropic,
): Promise<{ ok: boolean; classificatie: string; regels?: Regel[]; leverancier?: string; factuurdatum?: string }> {
  const { data: blob, error } = await service.storage.from('inkoopfacturen').download(storagePath)
  if (error || !blob) return { ok: false, classificatie: 'fout' }

  const buffer = await blob.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const isAfbeelding = bestandType !== 'pdf'

  const contentBlocks: ContentBlockParam[] = [
    isAfbeelding
      ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as ContentBlockParam,
    {
      type: 'text',
      text: `Lees dit document uit. Is dit een inkoopfactuur? Als nee: {"classificatie":"geen_factuur","reden":"..."}
Als ja:
{"classificatie":"inkoopfactuur","leverancier":"...","factuurdatum":"YYYY-MM-DD","regels":[{"omschrijving":"...","artikelnummer":"..." of null,"aantal":1,"eenheid":"stuk","prijs_per_eenheid":0.00}]}
Alleen fysieke materialen, prijzen excl. BTW. Geef ALLEEN geldige JSON.`,
    },
  ]

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    })
    const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    if (parsed.classificatie !== 'inkoopfactuur') return { ok: true, classificatie: 'overig' }
    return { ok: true, classificatie: 'inkoopfactuur', regels: parsed.regels ?? [], leverancier: parsed.leverancier, factuurdatum: parsed.factuurdatum }
  } catch {
    return { ok: false, classificatie: 'fout' }
  }
}

export async function POST(request: NextRequest) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const { batch_id } = await request.json()
    if (!batch_id) return NextResponse.json({ fout: 'Geen batch_id.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ fout: 'Niet ingelogd.' }, { status: 401 })

    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) return NextResponse.json({ fout: 'Geen bedrijf.' }, { status: 400 })

    // Haal alle niet-verwerkte bestanden op
    const { data: bestanden } = await supabase
      .from('upload_bestanden')
      .select('id, bestandsnaam, storage_path, type')
      .eq('batch_id', batch_id)
      .is('verwerkt_op', null)
      .not('storage_path', 'is', null)

    if (!bestanden || bestanden.length === 0) {
      return NextResponse.json({ verwerkt: 0, bericht: 'Geen bestanden om te verwerken.' })
    }

    // Zet batch op processing
    await supabase.from('upload_batches').update({ status: 'processing' }).eq('id', batch_id)

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Laad materiaalbibliotheek eenmalig voor matching
    const { data: bibliotheek } = await supabase
      .from('materialen')
      .select('id, naam, artikelnummer, leverancier')
      .eq('bedrijf_id', bedrijf.id)
    const mat = bibliotheek ?? []

    let aantalFacturen = 0
    let aantalOverig = 0
    let aantalFouten = 0

    for (const b of bestanden) {
      await supabase.from('upload_bestanden').update({ classificatie: 'bezig' }).eq('id', b.id)

      const resultaat = await verwerkEenBestand(service, b.id, b.storage_path as string, b.type as string, anthropic)

      await supabase.from('upload_bestanden').update({
        classificatie: resultaat.classificatie,
        verwerkt_op: new Date().toISOString(),
        fout_melding: resultaat.ok ? null : 'Verwerken mislukt',
      }).eq('id', b.id)

      // Sla regels op + match tegen bibliotheek
      if (resultaat.classificatie === 'inkoopfactuur' && resultaat.regels) {
        const regelsOmInvoegen = resultaat.regels.map((r) => {
          // 1. Match op artikelnummer + leverancier
          let matchId: string | null = null
          let matchMethode: string = 'nieuw'
          let matchZekerheid: number = 0

          if (r.artikelnummer && resultaat.leverancier) {
            const artMatch = mat.find(
              (m) => m.artikelnummer === r.artikelnummer &&
                m.leverancier?.toLowerCase() === resultaat.leverancier?.toLowerCase()
            )
            if (artMatch) { matchId = artMatch.id; matchMethode = 'artikelnummer'; matchZekerheid = 1.0 }
          }

          // 2. Fuzzy naam-match als fallback
          if (!matchId) {
            const naamLower = r.omschrijving.toLowerCase()
            const naamMatch = mat.find((m) => {
              const ml = m.naam.toLowerCase()
              return ml === naamLower || ml.includes(naamLower) || naamLower.includes(ml)
            })
            if (naamMatch) { matchId = naamMatch.id; matchMethode = 'naam'; matchZekerheid = 0.7 }
          }

          return {
            bestand_id: b.id,
            leverancier: resultaat.leverancier ?? null,
            factuurdatum: resultaat.factuurdatum ?? null,
            omschrijving: r.omschrijving,
            artikelnummer: r.artikelnummer ?? null,
            aantal: r.aantal,
            eenheid: r.eenheid,
            prijs_per_eenheid: r.prijs_per_eenheid,
            match_materiaal_id: matchId,
            match_methode: matchMethode,
            match_zekerheid: matchZekerheid,
          }
        })

        if (regelsOmInvoegen.length > 0) {
          await supabase.from('upload_regels').insert(regelsOmInvoegen)
        }
      }

      if (resultaat.classificatie === 'inkoopfactuur') aantalFacturen++
      else if (resultaat.classificatie === 'overig') aantalOverig++
      else aantalFouten++

      // Voortgang bijhouden in batch
      await supabase.from('upload_batches').update({
        verwerkt: aantalFacturen + aantalOverig + aantalFouten,
      }).eq('id', batch_id)
    }

    // Batch afsluiten
    await supabase.from('upload_batches').update({
      status: 'review_pending',
      verwerkt: aantalFacturen + aantalOverig + aantalFouten,
      voltooid_op: new Date().toISOString(),
    }).eq('id', batch_id)

    // Mail sturen
    const { data: userData } = await service.auth.admin.getUserById(user.id)
    const email = userData?.user?.email
    if (email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vakbuddy.nl'
      await resend.emails.send({
        from: 'Vakbuddy <noreply@vakbuddy.nl>',
        to: email,
        subject: `✓ ${aantalFacturen} facturen uitgelezen — klaar voor review`,
        html: `
<p>Je batch is verwerkt:</p>
<ul>
  <li>✓ ${aantalFacturen} inkoopfacturen uitgelezen</li>
  <li>${aantalOverig} bestanden waren geen factuur</li>
  ${aantalFouten > 0 ? `<li>⚠️ ${aantalFouten} fouten</li>` : ''}
</ul>
<p><a href="${appUrl}/instellingen/bulk-import" style="background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Bekijk resultaten →</a></p>
        `.trim(),
        text: `Je batch is verwerkt: ${aantalFacturen} facturen uitgelezen, ${aantalOverig} geen factuur${aantalFouten > 0 ? `, ${aantalFouten} fouten` : ''}. Bekijk: ${appUrl}/instellingen/bulk-import`,
      })
    }

    return NextResponse.json({ verwerkt: bestanden.length, facturen: aantalFacturen, overig: aantalOverig, fouten: aantalFouten })
  } catch (error) {
    const bericht = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ fout: bericht }, { status: 500 })
  }
}
