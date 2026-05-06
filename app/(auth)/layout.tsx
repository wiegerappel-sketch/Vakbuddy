export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1a2e4a] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-[#f97316] font-black text-4xl tracking-tight">Vak</span>
          <span className="text-white font-black text-4xl tracking-tight">buddy</span>
          <p className="text-blue-300 text-sm mt-2">Spreek je klus in. Wij maken de factuur.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
