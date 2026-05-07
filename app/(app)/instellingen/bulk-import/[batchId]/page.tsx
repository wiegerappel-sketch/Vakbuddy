'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Regel = {
  id: string
  omschrijving: string
  artikelnummer: string | null
  leverancier: string | null
  factuurdatum: string | null
  aantal: number
  eenheid: string
  prijs_per_eenheid: number
  match_materiaal_id: string | null
  match_methode: string | null
  match_zekerheid: number | null
  match_naam?: string | null
  prijs_verschil_pct?: number | null
  bevestigd?: boolean
  overgeslagen?: boolean
}

type MateriaalData = {
  inkoopprijs: number | null
  marge_percentage: number | null
  inkoopprijs_geschiedenis: { datum: string; prijs: number }[]
}

type BatchStats = {
  totaal_bestanden: number
  verwerkt: number
  status: string
}

export default function BulkReviewPage() {
  const { batchId } = useParams<{ batchId: string }>()
  const router = useRouter()
  const [regels, setRegels] = useState<Regel[]>([])
  const [stats, setStats] = useState<BatchStats | null>(null)
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [klaar, setKlaar] = useState(false)
  const [materialenMap, setMaterialenMap] = useState<Record<string, MateriaalData>>({})

  useEffect(() => {
    laadData()
  }, [batchId])

  async function laadData() {
    const supabase = createClient()

    const [{ data: batch }, { data: rawRegels }] = await Promise.all([
      supabase.from('upload_batches').select('totaal_bestanden, verwerkt, status').eq('id', batchId).single(),
      supabase.from('upload_regels')
        .select('id, omschrijving, artikelnummer, leverancier, factuurdatum, aantal, eenheid, prijs_per_eenheid, match_materiaal_id, match_methode, match_zekerheid')
        .in('bestand_id', supabase.from('upload_bestanden').select('id').eq('batch_id', batchId) as unknown as string[]),
    ])

    setStats(batch as BatchStats | null)

    if (!rawRegels) { setLaden(false); return }

    // Haal namen + prijsdata van gematchte materialen op
    const matchIds = [...new Set(rawRegels.filter((r) => r.match_materiaal_id).map((r) => r.match_materiaal_id as string))]
    let namenMap: Record<string, string> = {}
    let matDataMap: Record<string, MateriaalData> = {}
    if (matchIds.length > 0) {
      const { data: matData } = await supabase
        .from('materialen')
        .select('id, naam, inkoopprijs, marge_percentage, inkoopprijs_geschiedenis')
        .in('id', matchIds)
      namenMap = Object.fromEntries((matData ?? []).map((m) => [m.id, m.naam]))
      matDataMap = Object.fromEntries((matData ?? []).map((m) => [m.id, {
        inkoopprijs: m.inkoopprijs as number | null,
        marge_percentage: m.marge_percentage as number | null,
        inkoopprijs_geschiedenis: (m.inkoopprijs_geschiedenis as { datum: string; prijs: number }[]) ?? [],
      }]))
    }
    setMaterialenMap(matDataMap)

    setRegels(rawRegels.map((r) => {
      const matData = r.match_materiaal_id ? matDataMap[r.match_materiaal_id] : null
      const prijs_verschil_pct = matData?.inkoopprijs && matData.inkoopprijs > 0
        ? Math.round(Math.abs((r.prijs_per_eenheid - matData.inkoopprijs) / matData.inkoopprijs * 100))
        : null
      return {
        ...r,
        match_naam: r.match_materiaal_id ? namenMap[r.match_materiaal_id] ?? null : null,
        prijs_verschil_pct,
        bevestigd: r.match_methode === 'artikelnummer',
        overgeslagen: false,
      }
    }) as Regel[])

    setKlaar(batch?.status === 'completed')
    setLaden(false)
  }

  function toggleBevestigd(id: string) {
    setRegels((prev) => prev.map((r) => r.id === id ? { ...r, bevestigd: !r.bevestigd, overgeslagen: false } : r))
  }

  function toggleOvergeslagen(id: string) {
    setRegels((prev) => prev.map((r) => r.id === id ? { ...r, overgeslagen: !r.overgeslagen, bevestigd: false } : r))
  }

  async function slaOp() {
    setOpslaan(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) return

    const vandaag = new Date().toISOString().split('T')[0]
    const teBevestigen = regels.filter((r) => r.bevestigd && !r.overgeslagen)

    for (const r of teBevestigen) {
      if (r.match_materiaal_id && (r.match_methode === 'artikelnummer' || r.match_methode === 'naam')) {
        const matData = materialenMap[r.match_materiaal_id]
        const marge = matData?.marge_percentage ?? 35
        const nieuweVerkoopprijs = Math.round(r.prijs_per_eenheid * (1 + marge / 100) * 100) / 100
        const nieuweGeschiedenis = [
          ...(matData?.inkoopprijs_geschiedenis ?? []),
          { datum: r.factuurdatum ?? vandaag, prijs: r.prijs_per_eenheid },
        ]
        await supabase.from('materialen').update({
          inkoopprijs: r.prijs_per_eenheid,
          prijs: nieuweVerkoopprijs,
          laatste_inkoop_datum: r.factuurdatum ?? vandaag,
          inkoopprijs_geschiedenis: nieuweGeschiedenis,
          ...(r.artikelnummer ? { artikelnummer: r.artikelnummer } : {}),
          ...(r.leverancier ? { leverancier: r.leverancier } : {}),
        }).eq('id', r.match_materiaal_id)
      } else if (r.match_methode === 'nieuw') {
        await supabase.from('materialen').insert({
          bedrijf_id: bedrijf.id,
          naam: r.omschrijving,
          eenheid: r.eenheid ?? 'stuk',
          inkoopprijs: r.prijs_per_eenheid,
          prijs: Math.round(r.prijs_per_eenheid * 1.4 * 100) / 100,
          marge_percentage: 40,
          laatste_inkoop_datum: r.factuurdatum ?? vandaag,
          artikelnummer: r.artikelnummer ?? null,
          leverancier: r.leverancier ?? null,
          inkoopprijs_geschiedenis: [{ datum: r.factuurdatum ?? vandaag, prijs: r.prijs_per_eenheid }],
        })
      }
    }

    await supabase.from('upload_batches').update({ status: 'completed' }).eq('id', batchId)
    setKlaar(true)
    setOpslaan(false)
  }

  const naamMatches = regels.filter((r) => r.match_methode === 'naam')
  const artikelMatches = regels.filter((r) => r.match_methode === 'artikelnummer')
  const nieuw = regels.filter((r) => r.match_methode === 'nieuw')
  const teBevestigenCount = regels.filter((r) => r.bevestigd && !r.overgeslagen).length

  if (laden) return <div className="text-gray-500">Laden...</div>

  return (
    <div>
      <button onClick={() => router.push('/instellingen/bulk-import')} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">
        ← Terug
      </button>

      <h2 className="text-lg font-semibold text-gray-900 mb-1">Resultaten controleren</h2>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { label: 'Artikelnr. match', waarde: artikelMatches.length, kleur: 'text-green-600' },
            { label: 'Naam-match', waarde: naamMatches.length, kleur: 'text-yellow-600' },
            { label: 'Nieuw', waarde: nieuw.length, kleur: 'text-blue-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.kleur}`}>{s.waarde}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {klaar && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-green-800">✓ Opgeslagen in je materiaalbibliotheek</p>
        </div>
      )}

      {/* Artikelnummer-matches — auto bevestigd */}
      {artikelMatches.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Automatisch gematcht op artikelnummer ({artikelMatches.length})
          </h3>
          <div className="flex flex-col gap-1">
            {artikelMatches.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="text-green-500 shrink-0">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{r.omschrijving}</p>
                  <p className="text-xs text-gray-400">{r.match_naam} · €{r.prijs_per_eenheid?.toFixed(2)}/{r.eenheid}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Naam-matches — gebruiker bevestigt */}
      {naamMatches.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Naam-match — controleer ({naamMatches.length})
          </h3>
          <div className="flex flex-col gap-2">
            {naamMatches.map((r) => (
              <div key={r.id} className={`bg-white border rounded-xl px-4 py-3 transition-colors ${r.bevestigd ? 'border-green-400' : r.overgeslagen ? 'border-gray-200 opacity-50' : 'border-yellow-300'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{r.omschrijving}</p>
                    <p className="text-xs text-gray-500">{r.leverancier} · {r.aantal} {r.eenheid} · €{r.prijs_per_eenheid?.toFixed(2)}</p>
                  </div>
                </div>
                <div className="bg-yellow-50 rounded-lg px-3 py-2 text-xs text-yellow-800 mb-3 flex items-center justify-between gap-2">
                  <span>Gevonden in bibliotheek: <strong>{r.match_naam}</strong>
                    <span className="ml-1 text-yellow-600">— inkoopprijs wordt bijgewerkt</span>
                  </span>
                  {r.prijs_verschil_pct !== null && r.prijs_verschil_pct !== undefined && r.prijs_verschil_pct > 15 && (
                    <span className="shrink-0 bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                      ↑{r.prijs_verschil_pct}%
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleBevestigd(r.id)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${r.bevestigd ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-green-100'}`}>
                    {r.bevestigd ? '✓ Bevestigd' : 'Bevestigen'}
                  </button>
                  <button onClick={() => toggleOvergeslagen(r.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-3">
                    Overslaan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nieuw */}
      {nieuw.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Nieuw toevoegen aan bibliotheek ({nieuw.length})
          </h3>
          <div className="flex flex-col gap-2">
            {nieuw.map((r) => (
              <div key={r.id} className={`bg-white border rounded-xl px-4 py-3 transition-colors ${r.bevestigd ? 'border-blue-400' : r.overgeslagen ? 'border-gray-200 opacity-50' : 'border-blue-200'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{r.omschrijving}</p>
                    <p className="text-xs text-gray-500">
                      {r.leverancier ?? 'Onbekende leverancier'} · {r.eenheid} · €{r.prijs_per_eenheid?.toFixed(2)} inkoop
                      <span className="ml-1 text-gray-400">(→ €{(r.prijs_per_eenheid * 1.4).toFixed(2)} verkoop, 40% marge)</span>
                    </p>
                    {r.artikelnummer && <p className="text-xs text-gray-400">Art. {r.artikelnummer}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleBevestigd(r.id)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${r.bevestigd ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-blue-100'}`}>
                    {r.bevestigd ? '✓ Toevoegen' : 'Toevoegen aan bibliotheek'}
                  </button>
                  <button onClick={() => toggleOvergeslagen(r.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-3">
                    Overslaan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opslaan */}
      {!klaar && regels.length > 0 && (
        <div className="sticky bottom-20 md:bottom-4 bg-white border border-gray-200 rounded-xl p-4 shadow-lg mt-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{teBevestigenCount}</span> materialen worden opgeslagen
            </p>
            <button
              onClick={slaOp}
              disabled={opslaan || teBevestigenCount === 0}
              className="bg-[#f97316] text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-orange-500 disabled:opacity-50 shrink-0"
            >
              {opslaan ? 'Bezig...' : 'Opslaan in bibliotheek →'}
            </button>
          </div>
        </div>
      )}

      {regels.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Geen materiaalregels gevonden in deze batch.</p>
      )}
    </div>
  )
}
