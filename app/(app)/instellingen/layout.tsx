'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function InstellingenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const tabs = [
    { href: '/instellingen', label: 'Bedrijfsgegevens' },
    { href: '/instellingen/tarieven', label: 'Tarieven' },
  ]

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Instellingen</h1>
      <div className="flex border-b border-gray-200 mb-8">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-sm px-4 py-2 border-b-2 -mb-px font-medium transition-colors ${
              pathname === tab.href
                ? 'border-[#f97316] text-[#f97316]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  )
}
