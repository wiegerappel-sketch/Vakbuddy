'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Factuur = {
  id: string
  klus_id: string
  factuurnummer: string
  datum: string
  totaal_incl_btw: number
  verzonden_op: string | null
  betaald_op: string | null
  klussen: {
    klanten: {
      naam: string
    } | null
  } | null
}

export default function FacturenPage() {
  const [facturen, setFacturen] = useState<Factuur[]>([])
  const [laden, setLaden] = useState(true)
  const [downloadBezig, setDownloadBezig] = useState<string | null>(null)
  const [betaaldBezig, setBetaaldBezig] = useState<string | null>(null)

  useEffect(() => {
    laadFacturen()
  }, [])

  async function laadFacturen() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) { setLaden(false); return }

    const { data } = await supabase
      .from('facturen')
      .select('id, klus_id, factuurnummer, datum, totaal_incl_btw, verzonden_op, betaald_op, klussen!klus_id(klanten!klant_id(naam))')
      .eq('bedrijf_id', bedrijf.id)
      .order('datum', { ascending: false })

    setFacturen((data as unknown as Factuur[]) ?? [])
    setLaden(false)
  }

  async function handleDownload(factuur: Factuur) {
    setDownloadBezig(factuur.id)
    const pdfVenster = window.open('', '_blank')
    const response = await fetch('/api/factuur-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factuur_id: factuur.id }),
    })
    if (response.ok) {
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (pdfVenster) pdfVenster.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } else {
      pdfVenster?.close()
    }
    setDownloadBezig(null)
  }

  async function handleBetaaldMarkeren(factuur: Factuur) {
    setBetaaldBezig(factuur.id)
    const supabase = createClient()
    await supabase.from('facturen')
      .update({ betaald_op: new Date().toISOString() })
      .eq('id', factuur.id)
    setFacturen((prev) => prev.map((f) =>
      f.id === factuur.id ? { ...f, betaald_op: new Date().toISOString() } : f
    ))
    setBetaaldBezig(null)
  }

  const [filterStatus, setFilterStatus] = useState<'alle' | 'openstaand' | 'betaald'>('openstaand')

  const openstaand = facturen.filter((f) => !f.betaald_op)
  const totaalDezeMaxand = facturen
    .filter((f) => {
      const d = new Date(f.datum)
      const nu = new Date()
      return d.getMonth() === nu.getMonth() && d.getFullYear() === nu.getFullYear()
    })
    .reduce((sum, f) => sum + Number(f.totaal_incl_btw), 0)

  const gefilterd = facturen.filter((f) => {
    if (filterStatus === 'openstaand') return !f.betaald_op
    if (filterStatus === 'betaald') return !!f.betaald_op
    return true
  })

  if (laden) return <div className="p-4 md:p-8 text-gray-500">Laden...</div>

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Facturen</h1>

      {/* Statistieken */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Deze maand</p>
          <p className="text-xl font-bold text-gray-900">€ {totaalDezeMaxand.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Openstaand</p>
          <p className="text-xl font-bold text-[#f97316]">{openstaand.length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4">
        {([['openstaand', 'Openstaand'], ['alle', 'Alle'], ['betaald', 'Betaald']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilterStatus(val)}
            className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
              filterStatus === val
                ? 'bg-[#1a2e4a] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {gefilterd.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {facturen.length === 0 ? 'Nog geen facturen aangemaakt.' : 'Geen facturen gevonden.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {gefilterd.map((factuur) => (
            <div key={factuur.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{factuur.factuurnummer}</p>
                  <p className="text-sm text-gray-500">
                    {factuur.klussen?.klanten?.naam ?? 'Onbekende klant'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">€ {Number(factuur.totaal_incl_btw).toFixed(2).replace('.', ',')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    factuur.betaald_op
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {factuur.betaald_op ? 'Betaald' : 'Openstaand'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleDownload(factuur)}
                  disabled={downloadBezig === factuur.id}
                  className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {downloadBezig === factuur.id ? 'Laden...' : '📄 PDF'}
                </button>
                {!factuur.betaald_op && (
                  <button
                    onClick={() => handleBetaaldMarkeren(factuur)}
                    disabled={betaaldBezig === factuur.id}
                    className="flex-1 bg-[#f97316] text-white text-sm font-medium py-2 rounded-lg hover:bg-orange-500 disabled:opacity-50"
                  >
                    {betaaldBezig === factuur.id ? 'Bezig...' : '✓ Betaald'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
