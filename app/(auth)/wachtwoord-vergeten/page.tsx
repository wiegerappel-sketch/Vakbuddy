'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function WachtwoordVergetenPage() {
  const [email, setEmail] = useState('')
  const [laden, setLaden] = useState(false)
  const [klaar, setKlaar] = useState(false)
  const [fout, setFout] = useState('')

  async function handleVerzenden(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/wachtwoord-reset`,
    })

    if (error) {
      setFout('Er ging iets mis. Controleer je e-mailadres.')
      setLaden(false)
      return
    }

    setKlaar(true)
  }

  if (klaar) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Mail verstuurd</h1>
        <p className="text-gray-500 text-sm">
          Check je inbox op <strong>{email}</strong>. Klik op de link om een nieuw wachtwoord in te stellen.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Wachtwoord vergeten</h1>
      <p className="text-gray-500 text-sm mb-6">We sturen je een link om je wachtwoord opnieuw in te stellen.</p>

      <form onSubmit={handleVerzenden} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            placeholder="jij@voorbeeld.nl"
          />
        </div>

        {fout && <p className="text-red-500 text-sm">{fout}</p>}

        <button
          type="submit"
          disabled={laden}
          className="bg-[#f97316] text-white rounded-lg py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50"
        >
          {laden ? 'Bezig...' : 'Stuur resetlink'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <Link href="/login" className="text-[#f97316] hover:underline">Terug naar inloggen</Link>
      </p>
    </div>
  )
}
