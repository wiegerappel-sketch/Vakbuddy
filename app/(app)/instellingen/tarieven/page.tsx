'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TarievenPage() {
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [melding, setMelding] = useState('')
  const [tarievenId, setTarievenId] = useState<string | null>(null)
  const [uurloon, setUurloon] = useState('65')
  const [voorrijkosten, setVoorrijkosten] = useState('25')
  const [btwPercentage, setBtwPercentage] = useState('21')

  useEffect(() => {
    laadTarieven()
  }, [])

  async function laadTarieven() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!bedrijf) { setLaden(false); return }

    const { data } = await supabase
      .from('tarieven')
      .select('*')
      .eq('bedrijf_id', bedrijf.id)
      .single()

    if (data) {
      setTarievenId(data.id)
      setUurloon(String(data.uurloon))
      setVoorrijkosten(String(data.voorrijkosten))
      setBtwPercentage(String(data.btw_percentage))
    }
    setLaden(false)
  }

  async function handleOpslaan(e: React.FormEvent) {
    e.preventDefault()
    setOpslaan(true)
    setMelding('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!bedrijf) { setMelding('Sla eerst je bedrijfsgegevens op.'); setOpslaan(false); return }

    const waarden = {
      bedrijf_id: bedrijf.id,
      uurloon: parseFloat(uurloon),
      voorrijkosten: parseFloat(voorrijkosten),
      btw_percentage: parseFloat(btwPercentage),
    }

    let error
    if (tarievenId) {
      const result = await supabase.from('tarieven').update(waarden).eq('id', tarievenId)
      error = result.error
    } else {
      const result = await supabase.from('tarieven').insert(waarden).select().single()
      error = result.error
      if (result.data) setTarievenId(result.data.id)
    }

    setMelding(error ? 'Er ging iets mis.' : 'Opgeslagen!')
    setOpslaan(false)
  }

  if (laden) return <div className="text-gray-500">Laden...</div>

  return (
    <div className="max-w-sm">
      <p className="text-gray-500 text-sm mb-8">Deze tarieven worden gebruikt voor de factuurberekening.</p>

      <form onSubmit={handleOpslaan} className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Uurloon (€)</label>
          <input type="number" value={uurloon} onChange={(e) => setUurloon(e.target.value)} min="0" step="0.01"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Voorrijkosten (€)</label>
          <input type="number" value={voorrijkosten} onChange={(e) => setVoorrijkosten(e.target.value)} min="0" step="0.01"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">BTW (%)</label>
          <input type="number" value={btwPercentage} onChange={(e) => setBtwPercentage(e.target.value)} min="0" max="100"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={opslaan}
            className="bg-[#f97316] text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
          {melding && <p className={melding === 'Opgeslagen!' ? 'text-green-600 text-sm' : 'text-red-500 text-sm'}>{melding}</p>}
        </div>
      </form>
    </div>
  )
}
