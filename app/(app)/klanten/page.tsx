'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Klant } from '@/types'

const legeKlant = {
  naam: '',
  adres: '',
  postcode: '',
  plaats: '',
  email: '',
  telefoon: '',
}

export default function KlantenPage() {
  const [klanten, setKlanten] = useState<Klant[]>([])
  const [laden, setLaden] = useState(true)
  const [formulierOpen, setFormulierOpen] = useState(false)
  const [bewerkKlant, setBewerkKlant] = useState<Klant | null>(null)
  const [opslaan, setOpslaan] = useState(false)
  const [melding, setMelding] = useState('')
  const [formulier, setFormulier] = useState(legeKlant)

  useEffect(() => {
    laadKlanten()
  }, [])

  async function laadKlanten() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!bedrijf) return

    const { data } = await supabase
      .from('klanten')
      .select('*')
      .eq('bedrijf_id', bedrijf.id)
      .order('naam')

    setKlanten(data ?? [])
    setLaden(false)
  }

  function openNieuw() {
    setBewerkKlant(null)
    setFormulier(legeKlant)
    setMelding('')
    setFormulierOpen(true)
  }

  function openBewerken(klant: Klant) {
    setBewerkKlant(klant)
    setFormulier({
      naam: klant.naam ?? '',
      adres: klant.adres ?? '',
      postcode: klant.postcode ?? '',
      plaats: klant.plaats ?? '',
      email: klant.email ?? '',
      telefoon: klant.telefoon ?? '',
    })
    setMelding('')
    setFormulierOpen(true)
  }

  async function handleOpslaan(e: React.FormEvent) {
    e.preventDefault()
    setOpslaan(true)
    setMelding('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (bewerkKlant) {
      const { error } = await supabase
        .from('klanten')
        .update(formulier)
        .eq('id', bewerkKlant.id)

      if (error) {
        setMelding('Er ging iets mis. Probeer opnieuw.')
      } else {
        setFormulierOpen(false)
        laadKlanten()
      }
    } else {
      const { data: bedrijf } = await supabase
        .from('bedrijven')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!bedrijf) {
        setMelding('Sla eerst je bedrijfsgegevens op.')
        setOpslaan(false)
        return
      }

      const { error } = await supabase
        .from('klanten')
        .insert({ ...formulier, bedrijf_id: bedrijf.id })

      if (error) {
        setMelding('Er ging iets mis. Probeer opnieuw.')
      } else {
        setFormulierOpen(false)
        laadKlanten()
      }
    }

    setOpslaan(false)
  }

  function handleVeld(veld: keyof typeof legeKlant, waarde: string) {
    setFormulier((prev) => ({ ...prev, [veld]: waarde }))
  }

  if (laden) return <div className="p-4 md:p-8 text-gray-500">Laden...</div>

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Klanten</h1>
        <button
          onClick={openNieuw}
          className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500"
        >
          + Nieuwe klant
        </button>
      </div>

      {formulierOpen && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {bewerkKlant ? 'Klant bewerken' : 'Klant toevoegen'}
          </h2>
          <form onSubmit={handleOpslaan} className="flex flex-col gap-4">
            <Veld label="Naam *" waarde={formulier.naam} onChange={(v) => handleVeld('naam', v)} required />
            <Veld label="Adres" waarde={formulier.adres} onChange={(v) => handleVeld('adres', v)} />
            <div className="flex gap-3">
              <div className="w-1/3">
                <Veld label="Postcode" waarde={formulier.postcode} onChange={(v) => handleVeld('postcode', v)} placeholder="1234 AB" />
              </div>
              <div className="flex-1">
                <Veld label="Plaats" waarde={formulier.plaats} onChange={(v) => handleVeld('plaats', v)} />
              </div>
            </div>
            <Veld label="E-mailadres" waarde={formulier.email} onChange={(v) => handleVeld('email', v)} type="email" />
            <Veld label="Telefoonnummer" waarde={formulier.telefoon} onChange={(v) => handleVeld('telefoon', v)} placeholder="06-12345678" />

            {melding && <p className="text-red-500 text-sm">{melding}</p>}

            <div className="flex gap-3 mt-2">
              <button
                type="submit"
                disabled={opslaan}
                className="bg-[#f97316] text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50"
              >
                {opslaan ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button
                type="button"
                onClick={() => setFormulierOpen(false)}
                className="text-gray-500 text-sm hover:text-gray-700"
              >
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}

      {klanten.length === 0 ? (
        <p className="text-gray-400 text-sm">Nog geen klanten toegevoegd.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {klanten.map((klant) => (
            <div key={klant.id} className="border border-gray-200 rounded-lg px-4 py-3 bg-white flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{klant.naam}</p>
                {klant.plaats && <p className="text-sm text-gray-500">{klant.adres}, {klant.postcode} {klant.plaats}</p>}
                {klant.telefoon && <p className="text-sm text-gray-500">{klant.telefoon}</p>}
              </div>
              <button
                onClick={() => openBewerken(klant)}
                className="text-sm text-[#f97316] hover:underline ml-4"
              >
                Bewerken
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Veld({
  label,
  waarde,
  onChange,
  placeholder = '',
  type = 'text',
  required = false,
}: {
  label: string
  waarde: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={waarde}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
      />
    </div>
  )
}
