'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/klanten', label: 'Klanten', icon: '👥' },
  { href: '/facturen', label: 'Facturen', icon: '🧾' },
  { href: '/instellingen', label: 'Instellingen', icon: '⚙️' },
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
    <>
      {/* Desktop topbar */}
      <nav className="hidden md:flex bg-[#1a2e4a] px-6 py-0 items-center justify-between shadow-md">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center py-4">
            <span className="text-[#f97316] font-black text-xl tracking-tight">Vak</span>
            <span className="text-white font-black text-xl tracking-tight">buddy</span>
          </Link>
          <div className="flex items-center">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm px-4 py-4 border-b-2 transition-colors font-medium ${
                  pathname === link.href || (link.href === '/instellingen' && pathname.startsWith('/instellingen'))
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

      {/* Mobile topbar */}
      <nav className="md:hidden bg-[#1a2e4a] px-4 py-3 flex items-center justify-between shadow-md">
        <Link href="/dashboard" className="flex items-center">
          <span className="text-[#f97316] font-black text-xl tracking-tight">Vak</span>
          <span className="text-white font-black text-xl tracking-tight">buddy</span>
        </Link>
        <button
          onClick={handleUitloggen}
          className="text-sm text-blue-300 hover:text-white transition-colors"
        >
          Uitloggen
        </button>
      </nav>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a2e4a] border-t border-[#223a5e] z-50 flex items-stretch">
        {links.slice(0, 2).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
              pathname === link.href
                ? 'text-[#f97316]'
                : 'text-blue-300'
            }`}
          >
            <span className="text-lg leading-none">{link.icon}</span>
            {link.label}
          </Link>
        ))}

        {/* Center nieuwe klus button */}
        <Link
          href="/klussen/nieuw"
          className="flex-none flex flex-col items-center justify-center px-4 -mt-4"
        >
          <div className="bg-[#f97316] w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-white text-2xl font-bold">
            +
          </div>
        </Link>

        {links.slice(2).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
              pathname === link.href || (link.href === '/instellingen' && pathname.startsWith('/instellingen'))
                ? 'text-[#f97316]'
                : 'text-blue-300'
            }`}
          >
            <span className="text-lg leading-none">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </div>

      {/* Spacer for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </>
  )
}
