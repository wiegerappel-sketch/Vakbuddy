'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/klanten', label: 'Klanten' },
  { href: '/facturen', label: 'Facturen' },
  { href: '/instellingen', label: 'Instellingen' },
]

export default function Navigatie() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleUitloggen() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="bg-[#1a2e4a] px-6 py-0 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center gap-2 py-4">
          <span className="text-[#f97316] font-black text-xl tracking-tight">Vak</span>
          <span className="text-white font-black text-xl tracking-tight">buddy</span>
        </Link>
        <div className="flex items-center">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm px-4 py-4 border-b-2 transition-colors font-medium ${
                pathname === link.href
                  ? 'border-[#f97316] text-white'
                  : 'border-transparent text-blue-200 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/klussen/nieuw"
          className="bg-[#f97316] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-500 transition-colors"
        >
          + Nieuwe klus
        </Link>
        <button
          onClick={handleUitloggen}
          className="text-sm text-blue-300 hover:text-white transition-colors"
        >
          Uitloggen
        </button>
      </div>
    </nav>
  )
}
