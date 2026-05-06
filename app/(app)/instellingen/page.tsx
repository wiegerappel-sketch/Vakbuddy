'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Bedrijf } from '@/types'

export default function InstellingenPage() {
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [melding, setMelding] = useState('')
  const [bedrijf, setBedrijf] = useState<Partial<Bedrijf>>({
    naam: '',
    kvk: '',
    btw_nummer: '',
    iban: '',
    adres: '',
    telefoon: '',
    email: '',
  })

  useEffect(() => {
    async function laadBedrijf() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('bedrijven')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) setBedrijf(data)
      setLaden(false)
    }

    laadBedrijf()
  }, [])

  async function handleOpslaan(e: React.FormEvent) {
    e.preventDefault()
    setOpslaan(true)
    setMelding('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let error
    if (bedrijf.id) {
      const result = await supabase
        .from('bedrijven')
        .update({ ...bedrijf })
        .eq('id', bedrijf.id)
      error = result.error
    } else {
      const result = await supabase
        .from('bedrijven')
        .insert({ ...bedrijf, user_id: user.id })
        .select()
        .single()
      error = result.error
      if (result.data) setBedrijf(result.data)
    }

    if (error) {
      setMelding('Er ging iets mis. Probeer opnieuw.')
    } else {
      setMelding('Opgeslagen!')
    }

    setOpslaan(false)
  }

  function handleVeld(veld: keyof Bedrijf, waarde: string) {
    setBedrijf((prev) => ({ ...prev, [veld]: waarde }))
  }

  if (laden) return <div className="text-gray-500">Laden...</div>

  return (
    <div className="max-w-lg">
      <p className="text-gray-500 text-sm mb-8">Deze gegevens komen op je facturen te staan.</p>

      <form onSubmit={handleOpslaan} className="flex flex-col gap-5">
        <Veld label="Bedrijfsnaam" waarde={bedrijf.naam ?? ''} onChange={(v) => handleVeld('naam', v)} />
        <Veld label="KVK-nummer" waarde={bedrijf.kvk ?? ''} onChange={(v) => handleVeld('kvk', v)} placeholder="12345678" />
        <Veld label="BTW-nummer" waarde={bedrijf.btw_nummer ?? ''} onChange={(v) => handleVeld('btw_nummer', v)} placeholder="NL123456789B01" />
        <Veld label="IBAN" waarde={bedrijf.iban ?? ''} onChange={(v) => handleVeld('iban', v)} placeholder="NL00 BANK 0000 0000 00" />
        <Veld label="Adres" waarde={bedrijf.adres ?? ''} onChange={(v) => handleVeld('adres', v)} placeholder="Straat 1, 1234 AB Stad" />
        <Veld label="Telefoonnummer" waarde={bedrijf.telefoon ?? ''} onChange={(v) => handleVeld('telefoon', v)} placeholder="06-12345678" />
        <Veld label="E-mailadres" waarde={bedrijf.email ?? ''} onChange={(v) => handleVeld('email', v)} type="email" />

        <div className="flex items-center gap-4 mt-2">
          <button
            type="submit"
            disabled={opslaan}
            className="bg-[#f97316] text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50"
          >
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
          {melding && (
            <p className={melding === 'Opgeslagen!' ? 'text-green-600 text-sm' : 'text-red-500 text-sm'}>
              {melding}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

function Veld({
  label,
  waarde,
  onChange,
  placeholder = '',
  type = 'text',
}: {
  label: string
  waarde: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={waarde}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
      />
    </div>
  )
}
