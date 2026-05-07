'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NieuweKlusPage() {
  const router = useRouter()
  const [fout, setFout] = useState('')

  useEffect(() => {
    async function maakKlus() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: bedrijf } = await supabase
        .from('bedrijven')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!bedrijf) { router.push('/onboarding'); return }

      const vandaag = new Date().toISOString().split('T')[0]
      const alleVelden = ['klant_naam', 'klant_adres', 'klant_email', 'klant_type', 'uren', 'aantal_mensen', 'omschrijving', 'materialen', 'voorrijkosten']

      const { data: klus, error } = await supabase
        .from('klussen')
        .insert({ bedrijf_id: bedrijf.id, status: 'concept', datum: vandaag, ontbrekende_velden: alleVelden })
        .select('id')
        .single()

      if (error || !klus) {
        setFout(error?.message ?? 'Klus aanmaken mislukt.')
        return
      }

      window.location.href = `/klussen/${klus.id}`
    }
    maakKlus()
  }, [])

  if (fout) return <div className="p-4 md:p-8 text-red-500">Fout: {fout}</div>
  return <div className="p-4 md:p-8 text-gray-500">Nieuwe klus aanmaken...</div>
}
