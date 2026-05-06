import Navigatie from '@/components/Navigatie'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigatie />
      <main className="max-w-4xl mx-auto">{children}</main>
    </div>
  )
}
