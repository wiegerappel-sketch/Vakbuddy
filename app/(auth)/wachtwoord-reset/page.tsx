'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function WachtwoordResetPage() {
  const router = useRouter()
  const [wachtwoord, setWachtwoord] = useState('')
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState('')

  async function handleOpslaan(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: wachtwoord })

    if (error) {
      setFout('Er ging iets mis. Probeer opnieuw.')
      setLaden(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Nieuw wachtwoord</h1>
      <p className="text-gray-500 text-sm mb-6">Kies een nieuw wachtwoord voor je account.</p>

      <form onSubmit={handleOpslaan} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nieuw wachtwoord</label>
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
          {laden ? 'Opslaan...' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </div>
  )
}
