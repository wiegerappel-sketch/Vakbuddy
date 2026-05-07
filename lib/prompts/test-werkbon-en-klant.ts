/**
 * Testscript voor de gecombineerde werkbon+klant extractie-prompt.
 *
 * Gebruik:
 *   node --experimental-strip-types lib/prompts/test-werkbon-en-klant.ts
 *
 * Vereist ANTHROPIC_API_KEY in .env.local of als omgevingsvariabele.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import { maakWerkbonEnKlantPrompt } from './werkbon-en-klant.ts'

// .env.local laden (Next.js-stijl, geen dotenv nodig in Node 24)
try {
  const envPath = join(process.cwd(), '.env.local')
  const envRaw = readFileSync(envPath, 'utf-8')
  for (const line of envRaw.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length && !process.env[key.trim()]) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '')
    }
  }
} catch {
  // geen .env.local — verwacht dat ANTHROPIC_API_KEY al in de omgeving staat
}

const TESTTRANSCRIPTIES = [
  {
    label: 'Nieuwe klant, volledig adres, duidelijke uren',
    tekst: 'Ik ben vandaag bij familie Janssen geweest aan de Kerkstraat 12 in Den Bosch. Twee uur gewerkt aan een lekkende kraan, nieuwe Grohe mengkraan geplaatst en wat afdichtmateriaal gebruikt. Voorrijkosten meenemen.',
  },
  {
    label: 'Bestaande klant, geen adres',
    tekst: 'Bij Pietersen weer geweest, drie kwartier, cv-ketel nagekeken, filter schoongemaakt. Geen materiaal gebruikt.',
  },
  {
    label: 'Zakelijke klant, meerdere mensen',
    tekst: 'Klus bij Installatiebedrijf De Vries BV op het bedrijventerrein in Vught. Met zijn tweeën vier uur gewerkt, nieuwe groepenkast geplaatst, zes aardlekschakelaars en tien meterkastgroepen.',
  },
]

async function runTest(label: string, transcriptie: string, client: Anthropic) {
  console.log('\n' + '═'.repeat(60))
  console.log(`TEST: ${label}`)
  console.log('─'.repeat(60))
  console.log(`Transcriptie: "${transcriptie}"`)
  console.log('─'.repeat(60))

  const prompt = maakWerkbonEnKlantPrompt('Geen materialen in bibliotheek.')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: prompt,
    messages: [{ role: 'user', content: transcriptie }],
  })

  const tekst = message.content[0].type === 'text' ? message.content[0].text : ''
  const schoon = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const resultaat = JSON.parse(schoon)
    console.log('OUTPUT:')
    console.log(JSON.stringify(resultaat, null, 2))

    // Samenvatting van zekerheid per veld
    const k = resultaat.klant
    const w = resultaat.werkbon
    console.log('\nZEKERHEID SAMENVATTING:')
    console.log(`  klant.naam:           ${k?.naam?.zekerheid ?? 'null'}  (${k?.naam?.waarde ?? '-'})`)
    console.log(`  klant.adres.straat:   ${k?.adres?.straat?.zekerheid ?? 'null'}  (${k?.adres?.straat?.waarde ?? '-'})`)
    console.log(`  klant.adres.plaats:   ${k?.adres?.plaats?.zekerheid ?? 'null'}  (${k?.adres?.plaats?.waarde ?? '-'})`)
    console.log(`  klant.type_klant:     ${k?.type_klant?.zekerheid ?? 'null'}  (${k?.type_klant?.waarde ?? '-'})`)
    console.log(`  werkbon.omschrijving: ${w?.omschrijving?.zekerheid ?? 'null'}  (${w?.omschrijving?.waarde ?? '-'})`)
    console.log(`  werkbon.uren:         ${w?.uren?.zekerheid ?? 'null'}  (${w?.uren?.waarde ?? '-'})`)
    console.log(`  werkbon.aantal_mensen:${w?.aantal_mensen?.zekerheid ?? 'null'}  (${w?.aantal_mensen?.waarde ?? '-'})`)
    console.log(`  werkbon.voorrijkosten:${w?.voorrijkosten_meenemen?.zekerheid ?? 'null'}  (${w?.voorrijkosten_meenemen?.waarde ?? '-'})`)
    console.log(`  meerdere_klussen:     ${resultaat.meerdere_klussen}`)
  } catch {
    console.error('PARSE FOUT — ruwe output:')
    console.error(schoon)
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY niet gevonden. Zet hem in .env.local of als omgevingsvariabele.')
    process.exit(1)
  }

  const client = new Anthropic({ apiKey })

  console.log('Werkbon+klant extractie-prompt test')
  console.log(`${TESTTRANSCRIPTIES.length} transcripties`)

  for (const { label, tekst } of TESTTRANSCRIPTIES) {
    await runTest(label, tekst, client)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('Klaar.')
}

main().catch(console.error)
