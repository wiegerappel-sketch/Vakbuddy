'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)

  async function handleInloggen(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })

    if (error) {
      setFout('E-mailadres of wachtwoord klopt niet.')
      setLaden(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Inloggen</h1>
      <p className="text-gray-500 text-sm mb-6">Welkom terug bij Vakbuddy</p>

      <form onSubmit={handleInloggen} className="flex flex-col gap-4">
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
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            placeholder="••••••••"
          />
        </div>

        {fout && <p className="text-red-500 text-sm">{fout}</p>}

        <button
          type="submit"
          disabled={laden}
          className="bg-[#f97316] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-orange-500 disabled:opacity-50"
        >
          {laden ? 'Bezig...' : 'Inloggen'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        <Link href="/wachtwoord-vergeten" className="text-[#f97316] hover:underline">
          Wachtwoord vergeten?
        </Link>
      </p>

      <p className="text-center text-sm text-gray-500 mt-2">
        Nog geen account?{' '}
        <Link href="/registreren" className="text-[#f97316] hover:underline">
          Registreren
        </Link>
      </p>
    </div>
  )
}
