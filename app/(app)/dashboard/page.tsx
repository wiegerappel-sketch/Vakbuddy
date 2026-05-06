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

export default function DashboardPage() {
  const [klussen, setKlussen] = useState<Klus[]>([])
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    laadKlussen()
  }, [])

  async function laadKlussen() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!bedrijf) { setLaden(false); return }

    const { data } = await supabase
      .from('klussen')
      .select('id, datum, status, werkbon_json, klanten(naam)')
      .eq('bedrijf_id', bedrijf.id)
      .order('aangemaakt_op', { ascending: false })
      .limit(20)

    setKlussen((data as unknown as Klus[]) ?? [])
    setLaden(false)
  }

  const statusLabel: Record<string, { tekst: string; kleur: string }> = {
    nieuw: { tekst: 'Nieuw', kleur: 'bg-gray-100 text-gray-600' },
    getranscribeerd: { tekst: 'Getranscribeerd', kleur: 'bg-yellow-100 text-yellow-700' },
    werkbon_klaar: { tekst: 'Werkbon klaar', kleur: 'bg-blue-100 text-blue-700' },
  }

  if (laden) return <div className="p-8 text-gray-500">Laden...</div>

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link
          href="/klussen/nieuw"
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          + Nieuwe klus
        </Link>
      </div>

      {klussen.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 mb-4">Nog geen klussen.</p>
          <Link href="/klussen/nieuw" className="text-blue-600 text-sm hover:underline">
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
                className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between hover:border-blue-300 transition-colors"
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
