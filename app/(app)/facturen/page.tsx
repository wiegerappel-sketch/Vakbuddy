'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Factuur = {
  id: string
  factuurnummer: string
  datum: string
  totaal_incl_btw: number
  verzonden_op: string | null
  klussen: {
    klanten: {
      naam: string
    } | null
  } | null
}

export default function FacturenPage() {
  const [facturen, setFacturen] = useState<Factuur[]>([])
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    laadFacturen()
  }, [])

  async function laadFacturen() {
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
      .from('facturen')
      .select('id, factuurnummer, datum, totaal_incl_btw, verzonden_op, klussen(klanten(naam))')
      .eq('bedrijf_id', bedrijf.id)
      .order('aangemaakt_op', { ascending: false })

    setFacturen((data as Factuur[]) ?? [])
    setLaden(false)
  }

  if (laden) return <div className="p-8 text-gray-500">Laden...</div>

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Facturen</h1>

      {facturen.length === 0 ? (
        <p className="text-gray-400 text-sm">Nog geen facturen aangemaakt.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {facturen.map((factuur) => (
            <div key={factuur.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{factuur.factuurnummer}</p>
                <p className="text-sm text-gray-500">
                  {factuur.klussen?.klanten?.naam ?? 'Onbekende klant'} — {new Date(factuur.datum).toLocaleDateString('nl-NL')}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900">€ {Number(factuur.totaal_incl_btw).toFixed(2).replace('.', ',')}</p>
                <p className={`text-xs ${factuur.verzonden_op ? 'text-green-600' : 'text-orange-500'}`}>
                  {factuur.verzonden_op
                    ? `Verstuurd op ${new Date(factuur.verzonden_op).toLocaleDateString('nl-NL')}`
                    : 'Nog niet verstuurd'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
