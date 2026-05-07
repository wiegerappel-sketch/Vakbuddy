'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Materiaal = {
  id: string
  naam: string
  prijs: number
  eenheid: string
}

const leeg = { naam: '', prijs: '', eenheid: 'stuk' }

export default function MaterialenPage() {
  const [materialen, setMaterialen] = useState<Materiaal[]>([])
  const [laden, setLaden] = useState(true)
  const [zoekterm, setZoekterm] = useState('')
  const [formulierOpen, setFormulierOpen] = useState(false)
  const [bewerken, setBewerken] = useState<Materiaal | null>(null)
  const [formulier, setFormulier] = useState(leeg)
  const [opslaan, setOpslaan] = useState(false)
  const [melding, setMelding] = useState('')

  useEffect(() => {
    laadMaterialen()
  }, [])

  async function laadMaterialen() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
    if (!bedrijf) { setLaden(false); return }
    const { data } = await supabase.from('materialen').select('*').eq('bedrijf_id', bedrijf.id).order('naam')
    setMaterialen(data ?? [])
    setLaden(false)
  }

  function openNieuw() {
    setBewerken(null)
    setFormulier(leeg)
    setMelding('')
    setFormulierOpen(true)
  }

  function openBewerken(m: Materiaal) {
    setBewerken(m)
    setFormulier({ naam: m.naam, prijs: String(m.prijs), eenheid: m.eenheid })
    setMelding('')
    setFormulierOpen(true)
  }

  async function handleOpslaan(e: React.FormEvent) {
    e.preventDefault()
    setOpslaan(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const waarden = { naam: formulier.naam, prijs: parseFloat(formulier.prijs) || 0, eenheid: formulier.eenheid }

    if (bewerken) {
      await supabase.from('materialen').update(waarden).eq('id', bewerken.id)
    } else {
      const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
      if (!bedrijf) { setOpslaan(false); return }
      await supabase.from('materialen').insert({ ...waarden, bedrijf_id: bedrijf.id })
    }

    setFormulierOpen(false)
    setOpslaan(false)
    laadMaterialen()
  }

  async function handleVerwijderen(id: string) {
    const supabase = createClient()
    await supabase.from('materialen').delete().eq('id', id)
    setMaterialen((prev) => prev.filter((m) => m.id !== id))
  }

  const gefilterd = materialen.filter((m) =>
    m.naam.toLowerCase().includes(zoekterm.toLowerCase())
  )

  if (laden) return <div className="text-gray-500">Laden...</div>

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 text-sm">{materialen.length} materialen</p>
        <button
          onClick={openNieuw}
          className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500"
        >
          + Nieuw materiaal
        </button>
      </div>

      {formulierOpen && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {bewerken ? 'Materiaal bewerken' : 'Materiaal toevoegen'}
          </h2>
          <form onSubmit={handleOpslaan} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Naam *</label>
              <input
                type="text"
                value={formulier.naam}
                onChange={(e) => setFormulier({ ...formulier, naam: e.target.value })}
                required
                placeholder="bijv. Stopcontact wit"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Verkoopprijs (€)</label>
                <input
                  type="number"
                  value={formulier.prijs}
                  onChange={(e) => setFormulier({ ...formulier, prijs: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-gray-600 mb-1">Eenheid</label>
                <select
                  value={formulier.eenheid}
                  onChange={(e) => setFormulier({ ...formulier, eenheid: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                >
                  <option>stuk</option>
                  <option>meter</option>
                  <option>rol</option>
                  <option>pak</option>
                  <option>set</option>
                  <option>liter</option>
                  <option>kg</option>
                </select>
              </div>
            </div>
            {melding && <p className="text-red-500 text-sm">{melding}</p>}
            <div className="flex gap-3 mt-1">
              <button type="submit" disabled={opslaan}
                className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
                {opslaan ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button type="button" onClick={() => setFormulierOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-700">
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}

      {materialen.length > 5 && (
        <input
          type="text"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          placeholder="Zoek materiaal..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
        />
      )}

      {gefilterd.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {materialen.length === 0 ? 'Nog geen materialen toegevoegd.' : 'Geen materialen gevonden.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {gefilterd.map((m) => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">{m.naam}</p>
                <p className="text-xs text-gray-500">€ {Number(m.prijs).toFixed(2).replace('.', ',')} / {m.eenheid}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => openBewerken(m)} className="text-sm text-[#f97316] hover:underline">
                  Bewerken
                </button>
                <button onClick={() => handleVerwijderen(m.id)} className="text-sm text-red-400 hover:text-red-600">
                  Verwijderen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
