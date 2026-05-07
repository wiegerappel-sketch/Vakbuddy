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
  ontbrekende_velden: string[] | null
}

const statusLabel: Record<string, { tekst: string; kleur: string }> = {
  concept:      { tekst: 'Concept',      kleur: 'bg-yellow-100 text-yellow-700' },
  compleet:     { tekst: 'Compleet',     kleur: 'bg-green-100 text-green-700' },
  gefactureerd: { tekst: 'Gefactureerd', kleur: 'bg-blue-100 text-blue-700' },
  betaald:      { tekst: 'Betaald',      kleur: 'bg-green-100 text-green-700' },
}

export default function KlussenPage() {
  const [klussen, setKlussen] = useState<Klus[]>([])
  const [gefilterd, setGefilterd] = useState<Klus[]>([])
  const [laden, setLaden] = useState(true)
  const [zoek, setZoek] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('alle')

  useEffect(() => {
    laadKlussen()
  }, [])

  useEffect(() => {
    let lijst = klussen
    if (filterStatus !== 'alle') {
      lijst = lijst.filter((k) => k.status === filterStatus)
    }
    if (zoek.trim()) {
      const q = zoek.toLowerCase()
      lijst = lijst.filter(
        (k) =>
          k.klanten?.naam?.toLowerCase().includes(q) ||
          k.werkbon_json?.omschrijving?.toLowerCase().includes(q),
      )
    }
    setGefilterd(lijst)
  }, [klussen, zoek, filterStatus])

  async function laadKlussen() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) { setLaden(false); return }

    const { data } = await supabase
      .from('klussen')
      .select('id, datum, status, werkbon_json, klanten(naam), ontbrekende_velden')
      .eq('bedrijf_id', bedrijf.id)
      .order('datum', { ascending: false })

    setKlussen((data as unknown as Klus[]) ?? [])
    setLaden(false)
  }

  const filterOpties = [
    { value: 'alle', label: 'Alle' },
    { value: 'concept', label: 'Concept' },
    { value: 'compleet', label: 'Compleet' },
    { value: 'gefactureerd', label: 'Gefactureerd' },
    { value: 'betaald', label: 'Betaald' },
  ]

  if (laden) return <div className="p-4 md:p-8 text-gray-500">Laden...</div>

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Klussen</h1>
        <Link
          href="/klussen/nieuw"
          className="bg-[#f97316] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-500 transition-colors"
        >
          + Nieuwe klus
        </Link>
      </div>

      {/* Zoek + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Zoek op klant of omschrijving..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <div className="flex gap-1 flex-wrap">
          {filterOpties.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === opt.value
                  ? 'bg-[#1a2e4a] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {gefilterd.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">
            {klussen.length === 0 ? 'Nog geen klussen aangemaakt.' : 'Geen klussen gevonden.'}
          </p>
          {klussen.length === 0 && (
            <Link href="/klussen/nieuw" className="text-[#f97316] text-sm font-medium hover:underline">
              Start je eerste klus →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {gefilterd.map((klus) => {
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
                  {klus.status === 'concept' && klus.ontbrekende_velden && klus.ontbrekende_velden.length > 0 && (
                    <p className="text-xs text-yellow-700 mt-0.5">
                      {klus.ontbrekende_velden.length} veld{klus.ontbrekende_velden.length > 1 ? 'en' : ''} ontbreken
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${status.kleur}`}>
                  {status.tekst}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4 text-center">{gefilterd.length} klus{gefilterd.length !== 1 ? 'sen' : ''}</p>
    </div>
  )
}
