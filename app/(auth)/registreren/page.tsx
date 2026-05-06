'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegistrerenPage() {
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)
  const [klaar, setKlaar] = useState(false)

  async function handleRegistreren(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password: wachtwoord })

    if (error) {
      setFout('Er ging iets mis. Probeer het opnieuw.')
      setLaden(false)
      return
    }

    setKlaar(true)
  }

  if (klaar) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Bijna klaar!</h1>
        <p className="text-gray-500 text-sm">
          We hebben een bevestigingsmail gestuurd naar <strong>{email}</strong>. Klik op de link in de mail om je account te activeren.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Account aanmaken</h1>
      <p className="text-gray-500 text-sm mb-6">Gratis starten met Vakbuddy</p>

      <form onSubmit={handleRegistreren} className="flex flex-col gap-4">
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
          <input
            type="password"
            required
            minLength={6}
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            placeholder="Minimaal 6 tekens"
          />
        </div>

        {fout && <p className="text-red-500 text-sm">{fout}</p>}

        <button
          type="submit"
          disabled={laden}
          className="bg-[#f97316] text-white rounded-lg py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50"
        >
          {laden ? 'Bezig...' : 'Account aanmaken'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Al een account?{' '}
        <Link href="/login" className="text-[#f97316] hover:underline">
          Inloggen
        </Link>
      </p>
    </div>
  )
}
