import Navigatie from '@/components/Navigatie'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigatie />
      <main>{children}</main>
    </div>
  )
}
