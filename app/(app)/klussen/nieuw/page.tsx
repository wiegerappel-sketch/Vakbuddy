'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NieuweKlusPage() {
  const router = useRouter()

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

      const { data: klus, error } = await supabase
        .from('klussen')
        .insert({ bedrijf_id: bedrijf.id, status: 'concept' })
        .select('id')
        .single()

      if (error || !klus) { router.push('/klussen'); return }

      router.replace(`/klussen/${klus.id}`)
    }
    maakKlus()
  }, [])

  return <div className="p-4 md:p-8 text-gray-500">Nieuwe klus aanmaken...</div>
}
