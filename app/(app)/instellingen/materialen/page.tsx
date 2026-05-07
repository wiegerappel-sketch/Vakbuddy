'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Categorie = { id: string; naam: string; default_marge_percentage: number }
type Materiaal = { id: string; naam: string; prijs: number; eenheid: string; inkoopprijs: number | null; marge_percentage: number | null; categorie_id: string | null; laatste_inkoop_datum: string | null }

type FactuurRegel = {
  omschrijving: string
  aantal: number
  eenheid: string
  prijs_per_eenheid: number
  materiaal_id: string | null
  materiaal_naam: string | null
  oude_prijs: number | null
  prijsVerschilPct: number | null
  toepassen: boolean
}

function prijsLeeftijd(datum: string | null): { kleur: string; dot: string; tekst: string | null } {
  if (!datum) return { kleur: 'text-gray-400', dot: 'bg-gray-300', tekst: 'Geen inkoopdatum' }
  const dagen = Math.floor((Date.now() - new Date(datum).getTime()) / 86400000)
  if (dagen <= 28) return { kleur: 'text-green-600', dot: 'bg-green-500', tekst: null }
  if (dagen <= 84) return { kleur: 'text-yellow-600', dot: 'bg-yellow-400', tekst: `${Math.floor(dagen / 7)} weken geleden` }
  if (dagen <= 180) return { kleur: 'text-orange-500', dot: 'bg-orange-400', tekst: `${Math.floor(dagen / 30)} mnd geleden — checken?` }
  return { kleur: 'text-red-500', dot: 'bg-red-500', tekst: `Meer dan 6 mnd oud` }
}

const DEFAULT_CATEGORIEEN = [
  { naam: 'Sanitair', default_marge_percentage: 40 },
  { naam: 'Elektra', default_marge_percentage: 35 },
  { naam: 'Verwarming/CV', default_marge_percentage: 35 },
  { naam: 'Kleinmateriaal', default_marge_percentage: 60 },
  { naam: 'Overig', default_marge_percentage: 30 },
]

function berekenVerkoopprijs(inkoopprijs: number | null, marge: number | null): number | null {
  if (!inkoopprijs || !marge) return null
  return inkoopprijs * (1 + marge / 100)
}

export default function MaterialenPage() {
  const [categorieen, setCategorieen] = useState<Categorie[]>([])
  const [materialen, setMaterialen] = useState<Materiaal[]>([])
  const [laden, setLaden] = useState(true)
  const [tab, setTab] = useState<'materialen' | 'categorieen' | 'inkoopfacturen'>('materialen')

  // Inkoopfactuur upload
  const [factuurBestand, setFactuurBestand] = useState<File | null>(null)
  const [factuurVerwerken, setFactuurVerwerken] = useState(false)
  const [factuurFout, setFactuurFout] = useState<string | null>(null)
  const [factuurResultaat, setFactuurResultaat] = useState<{
    factuur_id: string | null; leverancier: string; factuurdatum: string; regels: FactuurRegel[]
  } | null>(null)
  const [toepassenBusy, setToepassenBusy] = useState(false)
  const [toepassenKlaar, setToepassenKlaar] = useState(false)
  const [zoekterm, setZoekterm] = useState('')

  // Materiaal formulier
  const [matFormulierOpen, setMatFormulierOpen] = useState(false)
  const [matBewerken, setMatBewerken] = useState<Materiaal | null>(null)
  const [matNaam, setMatNaam] = useState('')
  const [matCategorieId, setMatCategorieId] = useState('')
  const [matInkoopprijs, setMatInkoopprijs] = useState('')
  const [matMarge, setMatMarge] = useState('')
  const [matEenheid, setMatEenheid] = useState('stuk')
  const [matOpslaan, setMatOpslaan] = useState(false)

  // Categorie formulier
  const [catFormulierOpen, setCatFormulierOpen] = useState(false)
  const [catBewerken, setCatBewerken] = useState<Categorie | null>(null)
  const [catNaam, setCatNaam] = useState('')
  const [catMarge, setCatMarge] = useState('')
  const [catOpslaan, setCatOpslaan] = useState(false)

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
    if (!bedrijf) { setLaden(false); return }

    const [catResult, matResult] = await Promise.all([
      supabase.from('materiaal_categorieen').select('*').eq('bedrijf_id', bedrijf.id).order('naam'),
      supabase.from('materialen').select('*').eq('bedrijf_id', bedrijf.id).order('naam'),
    ])

    // Seed standaard categorieën als er nog geen zijn
    if ((catResult.data ?? []).length === 0) {
      await supabase.from('materiaal_categorieen').insert(
        DEFAULT_CATEGORIEEN.map((c) => ({ ...c, bedrijf_id: bedrijf.id }))
      )
      const { data: nieuw } = await supabase.from('materiaal_categorieen').select('*').eq('bedrijf_id', bedrijf.id).order('naam')
      setCategorieen(nieuw ?? [])
    } else {
      setCategorieen(catResult.data ?? [])
    }

    setMaterialen((matResult.data as unknown as Materiaal[]) ?? [])
    setLaden(false)
  }

  function openNieuwMateriaal() {
    setMatBewerken(null)
    setMatNaam(''); setMatCategorieId(''); setMatInkoopprijs(''); setMatMarge(''); setMatEenheid('stuk')
    setMatFormulierOpen(true)
  }

  function openBewerkMateriaal(m: Materiaal) {
    setMatBewerken(m)
    setMatNaam(m.naam)
    setMatCategorieId(m.categorie_id ?? '')
    setMatInkoopprijs(m.inkoopprijs != null ? String(m.inkoopprijs) : '')
    setMatMarge(m.marge_percentage != null ? String(m.marge_percentage) : '')
    setMatEenheid(m.eenheid)
    setMatFormulierOpen(true)
  }

  function handleCategorieKiezen(categorieId: string) {
    setMatCategorieId(categorieId)
    if (categorieId && !matMarge) {
      const cat = categorieen.find((c) => c.id === categorieId)
      if (cat) setMatMarge(String(cat.default_marge_percentage))
    }
  }

  const verkooppreview = berekenVerkoopprijs(parseFloat(matInkoopprijs) || null, parseFloat(matMarge) || null)

  // Prijssprong berekenen voor waarschuwing
  const oudePrijs = matBewerken?.inkoopprijs ?? null
  const nieuwePrijs = parseFloat(matInkoopprijs) || null
  const prijsVerschilPct = oudePrijs && nieuwePrijs && oudePrijs > 0
    ? Math.abs((nieuwePrijs - oudePrijs) / oudePrijs * 100)
    : null
  const [wachtOpBevestiging, setWachtOpBevestiging] = useState(false)

  async function slaMateriaalOp() {
    setMatOpslaan(true)
    setWachtOpBevestiging(false)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const inkoopprijs = parseFloat(matInkoopprijs) || null
    const marge = parseFloat(matMarge) || null
    const verkoopprijs = berekenVerkoopprijs(inkoopprijs, marge)

    const waarden = {
      naam: matNaam,
      eenheid: matEenheid,
      categorie_id: matCategorieId || null,
      inkoopprijs,
      marge_percentage: marge,
      prijs: verkoopprijs ?? parseFloat(matInkoopprijs) ?? 0,
      // Datum bijwerken als inkoopprijs is ingevuld
      ...(inkoopprijs != null ? { laatste_inkoop_datum: new Date().toISOString().split('T')[0] } : {}),
    }

    if (matBewerken) {
      await supabase.from('materialen').update(waarden).eq('id', matBewerken.id)
    } else {
      const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
      if (!bedrijf) { setMatOpslaan(false); return }
      await supabase.from('materialen').insert({ ...waarden, bedrijf_id: bedrijf.id })
    }

    setMatFormulierOpen(false)
    setMatOpslaan(false)
    laadAlles()
  }

  async function handleMatOpslaan(e: React.FormEvent) {
    e.preventDefault()
    // Grote prijssprong (>40%) → bevestiging vragen
    if (prijsVerschilPct !== null && prijsVerschilPct > 40) {
      setWachtOpBevestiging(true)
      return
    }
    await slaMateriaalOp()
  }

  async function handleMatVerwijderen(id: string) {
    const supabase = createClient()
    await supabase.from('materialen').delete().eq('id', id)
    setMaterialen((prev) => prev.filter((m) => m.id !== id))
  }

  function openNieuwCategorie() {
    setCatBewerken(null); setCatNaam(''); setCatMarge('35')
    setCatFormulierOpen(true)
  }

  function openBewerkCategorie(c: Categorie) {
    setCatBewerken(c); setCatNaam(c.naam); setCatMarge(String(c.default_marge_percentage))
    setCatFormulierOpen(true)
  }

  async function handleCatOpslaan(e: React.FormEvent) {
    e.preventDefault()
    setCatOpslaan(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const waarden = { naam: catNaam, default_marge_percentage: parseFloat(catMarge) || 35 }

    if (catBewerken) {
      await supabase.from('materiaal_categorieen').update(waarden).eq('id', catBewerken.id)
    } else {
      const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).single()
      if (!bedrijf) { setCatOpslaan(false); return }
      await supabase.from('materiaal_categorieen').insert({ ...waarden, bedrijf_id: bedrijf.id })
    }

    setCatFormulierOpen(false)
    setCatOpslaan(false)
    laadAlles()
  }

  const gefilterd = materialen.filter((m) => m.naam.toLowerCase().includes(zoekterm.toLowerCase()))

  async function verwerkInkoopfactuur() {
    if (!factuurBestand) return
    setFactuurVerwerken(true)
    setFactuurFout(null)
    setFactuurResultaat(null)
    setToepassenKlaar(false)

    const form = new FormData()
    form.append('bestand', factuurBestand)

    const res = await fetch('/api/inkoopfactuur-verwerken', { method: 'POST', body: form })
    const data = await res.json()
    setFactuurVerwerken(false)

    if (data.fout) { setFactuurFout(data.fout); return }
    setFactuurResultaat(data)
  }

  function toggleRegel(i: number) {
    if (!factuurResultaat) return
    const regels = [...factuurResultaat.regels]
    regels[i] = { ...regels[i], toepassen: !regels[i].toepassen }
    setFactuurResultaat({ ...factuurResultaat, regels })
  }

  async function pasPrijzenToe() {
    if (!factuurResultaat) return
    setToepassenBusy(true)
    const supabase = createClient()
    const vandaag = new Date().toISOString().split('T')[0]

    const teUpdaten = factuurResultaat.regels.filter((r) => r.toepassen && r.materiaal_id)
    for (const regel of teUpdaten) {
      const mat = materialen.find((m) => m.id === regel.materiaal_id)
      const marge = mat?.marge_percentage ?? 35
      const verkoopprijs = regel.prijs_per_eenheid * (1 + marge / 100)
      await supabase.from('materialen').update({
        inkoopprijs: regel.prijs_per_eenheid,
        prijs: verkoopprijs,
        laatste_inkoop_datum: vandaag,
      }).eq('id', regel.materiaal_id!)

      // Regel opslaan in inkoopfactuur_regels als factuur_id bekend is
      if (factuurResultaat.factuur_id) {
        await supabase.from('inkoopfactuur_regels').insert({
          factuur_id: factuurResultaat.factuur_id,
          omschrijving: regel.omschrijving,
          aantal: regel.aantal,
          eenheid: regel.eenheid,
          prijs_per_eenheid: regel.prijs_per_eenheid,
          materiaal_id: regel.materiaal_id,
        })
      }
    }

    setToepassenBusy(false)
    setToepassenKlaar(true)
    laadAlles()
  }

  if (laden) return <div className="text-gray-500">Laden...</div>

  return (
    <div className="max-w-lg">
      {/* Subtabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        {([
          ['materialen', `Materialen (${materialen.length})`],
          ['categorieen', 'Categorieën'],
          ['inkoopfacturen', 'Inkoopfactuur'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm pb-2 border-b-2 -mb-px font-medium transition-colors ${tab === t ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'categorieen' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Stel een standaard marge in per categorie.</p>
            <button onClick={openNieuwCategorie}
              className="bg-[#f97316] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-orange-500">
              + Nieuw
            </button>
          </div>

          {catFormulierOpen && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
              <form onSubmit={handleCatOpslaan} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Naam categorie</label>
                  <input type="text" value={catNaam} onChange={(e) => setCatNaam(e.target.value)} required
                    placeholder="bijv. Sanitair"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Standaard marge (%)</label>
                  <input type="number" value={catMarge} onChange={(e) => setCatMarge(e.target.value)} min="0" max="500" step="0.5"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={catOpslaan}
                    className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
                    {catOpslaan ? 'Opslaan...' : 'Opslaan'}
                  </button>
                  <button type="button" onClick={() => setCatFormulierOpen(false)} className="text-sm text-gray-500">Annuleren</button>
                </div>
              </form>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {categorieen.map((c) => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{c.naam}</p>
                  <p className="text-xs text-gray-500">Standaard marge: {c.default_marge_percentage}%</p>
                </div>
                <button onClick={() => openBewerkCategorie(c)} className="text-sm text-[#f97316] hover:underline">Bewerken</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'inkoopfacturen' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">Upload een inkoopfactuur (PDF) om de inkoopprijzen in je bibliotheek bij te werken.</p>

          {!factuurResultaat && (
            <div className="flex flex-col gap-3">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFactuurBestand(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-[#f97316] hover:file:bg-orange-100"
              />
              {factuurBestand && (
                <button
                  onClick={verwerkInkoopfactuur}
                  disabled={factuurVerwerken}
                  className="self-start bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
                  {factuurVerwerken ? 'Bezig met verwerken...' : 'Factuur verwerken'}
                </button>
              )}
              {factuurFout && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{factuurFout}</p>
              )}
            </div>
          )}

          {factuurResultaat && !toepassenKlaar && (
            <div className="flex flex-col gap-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{factuurResultaat.leverancier}</p>
                <p className="text-xs text-gray-500">{factuurResultaat.factuurdatum}</p>
              </div>

              <div className="flex flex-col gap-2">
                {factuurResultaat.regels.map((regel, i) => {
                  const verschilKleur = regel.prijsVerschilPct == null ? '' :
                    regel.prijsVerschilPct > 40 ? 'text-red-600' :
                    regel.prijsVerschilPct > 15 ? 'text-yellow-600' : 'text-green-600'

                  return (
                    <div key={i} className={`bg-white border rounded-lg px-4 py-3 flex items-start gap-3 ${regel.toepassen ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                      <input
                        type="checkbox"
                        checked={regel.toepassen}
                        onChange={() => toggleRegel(i)}
                        className="mt-0.5 accent-[#f97316] w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{regel.omschrijving}</p>
                        {regel.materiaal_naam && (
                          <p className="text-xs text-gray-500">→ {regel.materiaal_naam}</p>
                        )}
                        {!regel.materiaal_id && (
                          <p className="text-xs text-orange-500">Niet gevonden in bibliotheek</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-gray-900">€ {regel.prijs_per_eenheid.toFixed(2).replace('.', ',')}</p>
                        {regel.oude_prijs != null && (
                          <p className={`text-xs ${verschilKleur}`}>
                            was € {regel.oude_prijs.toFixed(2).replace('.', ',')}
                            {regel.prijsVerschilPct != null && ` (${regel.prijsVerschilPct > 0 ? '+' : ''}${regel.prijsVerschilPct.toFixed(0)}%)`}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-3 items-center">
                <button
                  onClick={pasPrijzenToe}
                  disabled={toepassenBusy || factuurResultaat.regels.every((r) => !r.toepassen || !r.materiaal_id)}
                  className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
                  {toepassenBusy ? 'Prijzen bijwerken...' : `${factuurResultaat.regels.filter((r) => r.toepassen && r.materiaal_id).length} prijzen toepassen`}
                </button>
                <button onClick={() => { setFactuurResultaat(null); setFactuurBestand(null); setFactuurFout(null) }}
                  className="text-sm text-gray-500 hover:text-gray-700">
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {toepassenKlaar && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex flex-col gap-2">
              <p className="text-sm font-medium text-green-800">Prijzen bijgewerkt.</p>
              <button
                onClick={() => { setFactuurResultaat(null); setFactuurBestand(null); setToepassenKlaar(false) }}
                className="self-start text-sm text-[#f97316] hover:underline">
                Nieuwe factuur uploaden
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'materialen' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">{materialen.length} materialen</p>
            <button onClick={openNieuwMateriaal}
              className="bg-[#f97316] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-orange-500">
              + Nieuw
            </button>
          </div>

          {matFormulierOpen && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{matBewerken ? 'Materiaal bewerken' : 'Materiaal toevoegen'}</h2>
              <form onSubmit={handleMatOpslaan} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Naam *</label>
                  <input type="text" value={matNaam} onChange={(e) => setMatNaam(e.target.value)} required
                    placeholder="bijv. Stopcontact wit"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Categorie</label>
                    <select value={matCategorieId} onChange={(e) => handleCategorieKiezen(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]">
                      <option value="">— geen —</option>
                      {categorieen.map((c) => <option key={c.id} value={c.id}>{c.naam}</option>)}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Eenheid</label>
                    <select value={matEenheid} onChange={(e) => setMatEenheid(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]">
                      <option>stuk</option>
                      <option>meter</option>
                      <option>rol</option>
                      <option>pak</option>
                      <option>set</option>
                      <option>liter</option>
                      <option>kg</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Inkoopprijs (€)</label>
                    <input type="number" value={matInkoopprijs} onChange={(e) => setMatInkoopprijs(e.target.value)}
                      min="0" step="0.01" placeholder="0,00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Marge (%)</label>
                    <input type="number" value={matMarge} onChange={(e) => setMatMarge(e.target.value)}
                      min="0" step="0.5" placeholder="35"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
                  </div>
                </div>
                {verkooppreview != null && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-600">Verkoopprijs: </span>
                    <span className="font-semibold text-gray-900">€ {verkooppreview.toFixed(2).replace('.', ',')}</span>
                    <span className="text-gray-500"> / {matEenheid}</span>
                  </div>
                )}

                {/* Prijssprong 15-40%: melding maar geen blokkering */}
                {prijsVerschilPct !== null && prijsVerschilPct > 15 && prijsVerschilPct <= 40 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
                    ⚠️ Prijs wijzigt {prijsVerschilPct.toFixed(0)}% t.o.v. vorige inkoopprijs (€ {oudePrijs?.toFixed(2).replace('.', ',')})
                  </div>
                )}

                {/* Prijssprong >40%: bevestiging vereist */}
                {wachtOpBevestiging && (
                  <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-3 flex flex-col gap-2">
                    <p className="text-sm font-semibold text-red-800">Grote prijssprong — klopt dit?</p>
                    <p className="text-sm text-red-700">
                      Was € {oudePrijs?.toFixed(2).replace('.', ',')}, nieuw € {nieuwePrijs?.toFixed(2).replace('.', ',')} ({prijsVerschilPct?.toFixed(0)}% verschil)
                    </p>
                    <div className="flex gap-2 mt-1">
                      <button type="button" onClick={slaMateriaalOp}
                        className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-700">
                        Ja, opslaan
                      </button>
                      <button type="button" onClick={() => setWachtOpBevestiging(false)}
                        className="text-sm text-gray-600 hover:text-gray-800">
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}

                {!wachtOpBevestiging && (
                  <div className="flex gap-3 mt-1">
                    <button type="submit" disabled={matOpslaan}
                      className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
                      {matOpslaan ? 'Opslaan...' : 'Opslaan'}
                    </button>
                    <button type="button" onClick={() => setMatFormulierOpen(false)} className="text-sm text-gray-500">Annuleren</button>
                  </div>
                )}
              </form>
            </div>
          )}

          {materialen.length > 5 && (
            <input type="text" value={zoekterm} onChange={(e) => setZoekterm(e.target.value)}
              placeholder="Zoek materiaal..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          )}

          {gefilterd.length === 0 ? (
            <p className="text-gray-400 text-sm">{materialen.length === 0 ? 'Nog geen materialen.' : 'Geen materialen gevonden.'}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {gefilterd.map((m) => {
                const cat = categorieen.find((c) => c.id === m.categorie_id)
                const vp = berekenVerkoopprijs(m.inkoopprijs, m.marge_percentage) ?? m.prijs
                const leeftijd = prijsLeeftijd(m.laatste_inkoop_datum)
                return (
                  <div key={m.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{m.naam}</p>
                        <span title={leeftijd.tekst ?? 'Prijs actueel'} className={`w-2 h-2 rounded-full shrink-0 ${leeftijd.dot}`} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {m.inkoopprijs != null
                          ? `Inkoop € ${Number(m.inkoopprijs).toFixed(2).replace('.', ',')} · ${m.marge_percentage ?? cat?.default_marge_percentage ?? '?'}% → € ${vp.toFixed(2).replace('.', ',')} / ${m.eenheid}`
                          : `€ ${Number(m.prijs).toFixed(2).replace('.', ',')} / ${m.eenheid}`}
                        {cat ? ` · ${cat.naam}` : ''}
                      </p>
                      {leeftijd.tekst && (
                        <p className={`text-xs mt-0.5 ${leeftijd.kleur}`}>{leeftijd.tekst}</p>
                      )}
                    </div>
                    <div className="flex gap-3 shrink-0 ml-3">
                      <button onClick={() => openBewerkMateriaal(m)} className="text-sm text-[#f97316] hover:underline">Bewerken</button>
                      <button onClick={() => handleMatVerwijderen(m.id)} className="text-sm text-red-400 hover:text-red-600">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
