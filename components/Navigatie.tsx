'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/klussen/nieuw', label: '+ Nieuwe klus' },
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
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-bold text-gray-900 text-lg">Vakbuddy</span>
        <div className="flex items-center gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                pathname === link.href
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <button
        onClick={handleUitloggen}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        Uitloggen
      </button>
    </nav>
  )
}
