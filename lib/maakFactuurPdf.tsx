import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'

const stijlen = StyleSheet.create({
  pagina: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  koptekst: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  bedrijfsnaam: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  bedrijfInfo: { fontSize: 9, color: '#555', lineHeight: 1.6 },
  factuurTitel: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginBottom: 4 },
  factuurMeta: { fontSize: 9, color: '#555', textAlign: 'right', lineHeight: 1.6 },
  klantBlok: { marginBottom: 32 },
  klantNaam: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sectieLabel: { fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  tabelHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 6, marginBottom: 6 },
  tabelRij: { flexDirection: 'row', paddingVertical: 4 },
  kolOmschrijving: { flex: 1 },
  kolAantal: { width: 60, textAlign: 'right' },
  kolPrijs: { width: 80, textAlign: 'right' },
  kolTotaal: { width: 80, textAlign: 'right' },
  headerTekst: { fontSize: 8, color: '#888', fontFamily: 'Helvetica-Bold' },
  totaalBlok: { marginTop: 24, alignItems: 'flex-end' },
  totaalRij: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  totaalLabel: { width: 120, textAlign: 'right', color: '#555' },
  totaalWaarde: { width: 80, textAlign: 'right' },
  totaalIncl: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  voettekst: { position: 'absolute', bottom: 40, left: 48, right: 48, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10, fontSize: 8, color: '#888', textAlign: 'center' },
})

function eur(bedrag: number) {
  return `€ ${bedrag.toFixed(2).replace('.', ',')}`
}

export type FactuurPdfResultaat = {
  pdf: Buffer
  factuurnummer: string
  totaalExclBtw: number
  btwBedrag: number
  totaalInclBtw: number
}

export async function maakFactuurPdf(
  klus_id: string,
  supabase: SupabaseClient,
  bestaandFactuurnummer?: string
): Promise<FactuurPdfResultaat> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd.')

  const { data: bedrijf } = await supabase.from('bedrijven').select('*').eq('user_id', user.id).single()
  const { data: tarieven } = await supabase.from('tarieven').select('*').eq('bedrijf_id', bedrijf?.id).single()
  const { data: klus } = await supabase.from('klussen').select('*, klanten!klant_id(*)').eq('id', klus_id).single()

  if (!bedrijf || !tarieven || !klus) throw new Error('Gegevens ontbreken.')

  const werkbon = klus.werkbon_json as {
    omschrijving: string
    uren: number
    materialen: { naam: string; aantal: number; eenheid: string; prijs?: number }[]
    voorrijkosten_meenemen: boolean
  }

  const klant = klus.klanten as { naam: string; adres: string | null; postcode: string | null; plaats: string | null } | null

  let factuurnummer: string
  if (bestaandFactuurnummer) {
    factuurnummer = bestaandFactuurnummer
  } else {
    const { count } = await supabase.from('facturen').select('*', { count: 'exact', head: true }).eq('bedrijf_id', bedrijf.id)
    factuurnummer = `${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  const arbeidsBedrag = werkbon.uren * tarieven.uurloon
  const voorrijBedrag = werkbon.voorrijkosten_meenemen ? tarieven.voorrijkosten : 0
  const materialenBedrag = werkbon.materialen.reduce((sum, m) => sum + (m.prijs ?? 0) * m.aantal, 0)
  const totaalExclBtw = arbeidsBedrag + voorrijBedrag + materialenBedrag
  const btwBedrag = totaalExclBtw * (tarieven.btw_percentage / 100)
  const totaalInclBtw = totaalExclBtw + btwBedrag

  const regels = [
    { omschrijving: werkbon.omschrijving, aantal: `${werkbon.uren} uur`, prijs: eur(tarieven.uurloon), totaal: eur(arbeidsBedrag) },
    ...(werkbon.voorrijkosten_meenemen ? [{ omschrijving: 'Voorrijkosten', aantal: '1x', prijs: eur(tarieven.voorrijkosten), totaal: eur(voorrijBedrag) }] : []),
    ...werkbon.materialen
      .filter((m) => m.prijs && m.prijs > 0)
      .map((m) => ({ omschrijving: m.naam, aantal: `${m.aantal} ${m.eenheid}`, prijs: eur(m.prijs!), totaal: eur(m.prijs! * m.aantal) })),
  ]

  const pdf = await renderToBuffer(
    <Document>
      <Page size="A4" style={stijlen.pagina}>
        <View style={stijlen.koptekst}>
          <View>
            <Text style={stijlen.bedrijfsnaam}>{bedrijf.naam ?? 'Bedrijfsnaam'}</Text>
            <Text style={stijlen.bedrijfInfo}>{bedrijf.adres ?? ''}</Text>
            <Text style={stijlen.bedrijfInfo}>KVK: {bedrijf.kvk ?? ''} | BTW: {bedrijf.btw_nummer ?? ''}</Text>
            <Text style={stijlen.bedrijfInfo}>IBAN: {bedrijf.iban ?? ''}</Text>
          </View>
          <View>
            <Text style={stijlen.factuurTitel}>FACTUUR</Text>
            <Text style={stijlen.factuurMeta}>Nummer: {factuurnummer}</Text>
            <Text style={stijlen.factuurMeta}>Datum: {new Date().toLocaleDateString('nl-NL')}</Text>
          </View>
        </View>

        {klant && (
          <View style={stijlen.klantBlok}>
            <Text style={stijlen.sectieLabel}>Aan</Text>
            <Text style={stijlen.klantNaam}>{klant.naam}</Text>
            {klant.adres && <Text>{klant.adres}</Text>}
            {klant.postcode && klant.plaats && <Text>{klant.postcode} {klant.plaats}</Text>}
          </View>
        )}

        <View style={{ marginBottom: 24 }}>
          <Text style={stijlen.sectieLabel}>Omschrijving</Text>
          <View style={stijlen.tabelHeader}>
            <Text style={[stijlen.headerTekst, stijlen.kolOmschrijving]}>Omschrijving</Text>
            <Text style={[stijlen.headerTekst, stijlen.kolAantal]}>Aantal</Text>
            <Text style={[stijlen.headerTekst, stijlen.kolPrijs]}>Prijs</Text>
            <Text style={[stijlen.headerTekst, stijlen.kolTotaal]}>Totaal</Text>
          </View>
          {regels.map((regel, i) => (
            <View key={i} style={stijlen.tabelRij}>
              <Text style={stijlen.kolOmschrijving}>{regel.omschrijving}</Text>
              <Text style={stijlen.kolAantal}>{regel.aantal}</Text>
              <Text style={stijlen.kolPrijs}>{regel.prijs}</Text>
              <Text style={stijlen.kolTotaal}>{regel.totaal}</Text>
            </View>
          ))}
        </View>

        <View style={stijlen.totaalBlok}>
          <View style={stijlen.totaalRij}>
            <Text style={stijlen.totaalLabel}>Subtotaal excl. BTW</Text>
            <Text style={stijlen.totaalWaarde}>{eur(totaalExclBtw)}</Text>
          </View>
          <View style={stijlen.totaalRij}>
            <Text style={stijlen.totaalLabel}>BTW {tarieven.btw_percentage}%</Text>
            <Text style={stijlen.totaalWaarde}>{eur(btwBedrag)}</Text>
          </View>
          <View style={[stijlen.totaalRij, { marginTop: 6 }]}>
            <Text style={[stijlen.totaalLabel, stijlen.totaalIncl]}>Totaal incl. BTW</Text>
            <Text style={[stijlen.totaalWaarde, stijlen.totaalIncl]}>{eur(totaalInclBtw)}</Text>
          </View>
        </View>

        <Text style={stijlen.voettekst}>
          {bedrijf.naam} — {bedrijf.email ?? ''} — {bedrijf.telefoon ?? ''}
        </Text>
      </Page>
    </Document>
  )

  return { pdf: pdf as unknown as Buffer, factuurnummer, totaalExclBtw, btwBedrag, totaalInclBtw }
}
