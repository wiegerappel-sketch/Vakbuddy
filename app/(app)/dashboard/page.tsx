'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Klus = {
  id: string
  datum: string
  status: string
  klanten: { naam: string } | null
  werkbon_json: { omschrijving: string } | null
}

type Stats = {
  dezeMaxand: number
  openstaand: number
  totaalKlussen: number
}

export default function DashboardPage() {
  const [klussen, setKlussen] = useState<Klus[]>([])
  const [concepten, setConcepten] = useState<Klus[]>([])
  const [stats, setStats] = useState<Stats>({ dezeMaxand: 0, openstaand: 0, totaalKlussen: 0 })
  const [laden, setLaden] = useState(true)
  useEffect(() => {
    laadData()
  }, [])

  async function laadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) { setLaden(false); return }

    const [klussenResult, facturenResult, conceptenResult] = await Promise.all([
      supabase
        .from('klussen')
        .select('id, datum, status, werkbon_json, klanten!klant_id(naam)')
        .eq('bedrijf_id', bedrijf.id)
        .order('datum', { ascending: false })
        .limit(10),
      supabase
        .from('facturen')
        .select('totaal_incl_btw, betaald_op, created_at')
        .eq('bedrijf_id', bedrijf.id),
      supabase
        .from('klussen')
        .select('id, datum, status, werkbon_json, klanten!klant_id(naam)')
        .eq('bedrijf_id', bedrijf.id)
        .eq('status', 'concept')
        .order('datum', { ascending: false })
        .limit(5),
    ])

    const facturen = facturenResult.data ?? []
    const nu = new Date()
    const dezeMaxand = facturen
      .filter((f) => {
        const d = new Date(f.created_at)
        return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear()
      })
      .reduce((sum, f) => sum + Number(f.totaal_incl_btw), 0)
    const openstaand = facturen.filter((f) => !f.betaald_op).length

    setKlussen((klussenResult.data as unknown as Klus[]) ?? [])
    setConcepten((conceptenResult.data as unknown as Klus[]) ?? [])
    setStats({ dezeMaxand, openstaand, totaalKlussen: klussenResult.data?.length ?? 0 })
    setLaden(false)
  }

  const statusLabel: Record<string, { tekst: string; kleur: string }> = {
    concept:      { tekst: 'Concept',      kleur: 'bg-yellow-100 text-yellow-700' },
    compleet:     { tekst: 'Compleet',     kleur: 'bg-green-100 text-green-700' },
    gefactureerd: { tekst: 'Gefactureerd', kleur: 'bg-blue-100 text-blue-700' },
    betaald:      { tekst: 'Betaald',      kleur: 'bg-green-100 text-green-700' },
  }

  if (laden) return <div className="p-4 md:p-8 text-gray-500">Laden...</div>

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Statistieken */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-[#1a2e4a] rounded-xl p-4">
          <p className="text-xs text-blue-300 mb-1">Gefactureerd deze maand</p>
          <p className="text-xl font-bold text-white">€ {stats.dezeMaxand.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Openstaande facturen</p>
          <p className="text-xl font-bold text-[#f97316]">{stats.openstaand}</p>
        </div>
      </div>

      {/* Concept-banner */}
      {concepten.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-yellow-800 mb-3">
            ⚠️ {concepten.length} werkbon{concepten.length > 1 ? 'nen' : ''} {concepten.length > 1 ? 'wachten' : 'wacht'} op gegevens
          </p>
          <div className="flex flex-col gap-2">
            {concepten.map((k) => (
              <Link
                key={k.id}
                href={`/klussen/${k.id}`}
                className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-yellow-200 hover:border-yellow-400 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {k.klanten?.naam ?? k.werkbon_json?.omschrijving ?? 'Onbekende klus'}
                  </p>
                </div>
                <span className="text-yellow-600 text-sm">Afmaken →</span>
              </Link>
            ))}
          </div>
          <Link href="/klussen?status=concept" className="text-xs text-yellow-700 font-medium hover:underline mt-2 inline-block">
            Bekijk alle concepten →
          </Link>
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Recente klussen</h2>

      {klussen.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">Nog geen klussen aangemaakt.</p>
          <Link href="/klussen/nieuw" className="text-[#f97316] text-sm font-medium hover:underline">
            Start je eerste klus →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {klussen.map((klus) => {
            const status = statusLabel[klus.status] ?? { tekst: klus.status, kleur: 'bg-gray-100 text-gray-600' }
            return (
              <Link
                key={klus.id}
                href={`/klussen/${klus.id}`}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between hover:border-orange-300 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {klus.werkbon_json?.omschrijving ?? 'Klus zonder werkbon'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {klus.klanten?.naam ?? 'Onbekende klant'} — {new Date(klus.datum).toLocaleDateString('nl-NL')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.kleur}`}>
                  {status.tekst}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
