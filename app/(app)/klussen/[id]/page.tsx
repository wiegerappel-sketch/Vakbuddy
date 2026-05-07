'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Klant, Klus } from '@/types'

type Materiaal = { naam: string; aantal: number; eenheid: string; prijs?: number; bibliotheek_id?: string | null; match_zekerheid?: string }

type Werkbon = {
  omschrijving: string
  uren: number
  materialen: Materiaal[]
  voorrijkosten_meenemen: boolean
  twijfels: string[]
}

type BibliotheekMateriaal = { id: string; naam: string; prijs: number; eenheid: string; laatste_inkoop_datum: string | null }

function prijsDot(datum: string | null): { dot: string; tekst: string } {
  if (!datum) return { dot: 'bg-gray-300', tekst: 'Geen inkoopdatum' }
  const dagen = Math.floor((Date.now() - new Date(datum).getTime()) / 86400000)
  if (dagen <= 28) return { dot: 'bg-green-500', tekst: 'Prijs actueel' }
  if (dagen <= 84) return { dot: 'bg-yellow-400', tekst: `${Math.floor(dagen / 7)} weken geleden` }
  if (dagen <= 180) return { dot: 'bg-orange-400', tekst: `${Math.floor(dagen / 30)} mnd geleden — checken?` }
  return { dot: 'bg-red-500', tekst: 'Meer dan 6 mnd oud' }
}

export default function KlusPage() {
  const params = useParams()
  const id = params.id as string
  const [klus, setKlus] = useState<Klus | null>(null)
  const [klant, setKlant] = useState<Klant | null>(null)
  const [laden, setLaden] = useState(true)
  const [transcriberen, setTranscriberen] = useState(false)
  const [werkbonMaken, setWerkbonMaken] = useState(false)
  const [werkbonBewerken, setWerkbonBewerken] = useState(false)
  const [bewerkWerkbon, setBewerkWerkbon] = useState<Werkbon | null>(null)
  const [factuurMaken, setFactuurMaken] = useState(false)
  const [mailVersturen, setMailVersturen] = useState(false)
  const [mailVerzonden, setMailVerzonden] = useState(false)
  const [factuurId, setFactuurId] = useState<string | null>(null)
  const [fout, setFout] = useState('')
  const [bibliotheek, setBibliotheek] = useState<BibliotheekMateriaal[]>([])
  const [materiaalZoek, setMateriaalZoek] = useState('')
  const [zoekOpen, setZoekOpen] = useState(false)
  const [vragen, setVragen] = useState<Materiaal[]>([])
  const [vraagAntwoorden, setVraagAntwoorden] = useState<Record<number, string>>({})

  useEffect(() => {
    laadKlus()
  }, [id])

  async function laadKlus() {
    const supabase = createClient()
    const { data } = await supabase.from('klussen').select('*').eq('id', id).single()
    if (data) {
      setKlus(data)
      if (data.klant_id) {
        const { data: klantData } = await supabase.from('klanten').select('*').eq('id', data.klant_id).single()
        setKlant(klantData)
      }
    }
    const { data: factuur } = await supabase
      .from('facturen')
      .select('id, verzonden_op')
      .eq('klus_id', id)
      .order('aangemaakt_op', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (factuur) {
      setFactuurId(factuur.id)
      if (factuur.verzonden_op) setMailVerzonden(true)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
      if (bedrijf) {
        const { data: mat } = await supabase.from('materialen').select('*').eq('bedrijf_id', bedrijf.id).order('naam')
        setBibliotheek(mat ?? [])
      }
    }
    setLaden(false)
  }

  async function handleTranscriberen(audioBlob: Blob) {
    setTranscriberen(true)
    setFout('')
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
    const formData = new FormData()
    formData.append('audio', audioBlob, `opname.${ext}`)
    const response = await fetch('/api/transcribe', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok || result.fout) { setFout(result.fout ?? 'Transcriptie mislukt.'); setTranscriberen(false); return }
    const supabase = createClient()
    await supabase.from('klussen').update({ transcriptie: result.tekst, status: 'getranscribeerd' }).eq('id', id)
    setKlus((prev) => prev ? { ...prev, transcriptie: result.tekst, status: 'getranscribeerd' } : prev)
    setTranscriberen(false)
  }

  async function handleWerkbonMaken() {
    if (!klus?.transcriptie) return
    setWerkbonMaken(true)
    setFout('')
    const response = await fetch('/api/extract-werkbon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptie: klus.transcriptie, klus_id: id }),
    })
    const result = await response.json()
    if (!response.ok || result.fout) { setFout(result.fout ?? 'Werkbon maken mislukt.'); setWerkbonMaken(false); return }
    const supabase = createClient()
    await supabase.from('klussen').update({ werkbon_json: result.werkbon, status: 'werkbon_klaar' }).eq('id', id)
    setKlus((prev) => prev ? { ...prev, werkbon_json: result.werkbon, status: 'werkbon_klaar' } : prev)

    // Klant bijwerken vanuit extractie-resultaat
    if (result.klant?.type === 'exact' || result.klant?.type === 'fuzzy' || result.klant?.type === 'nieuw') {
      setKlant(result.klant.klant)
    }

    // Materialen zonder prijs verzamelen voor vragen (max 2)
    const onbekend = (result.werkbon.materialen as Materiaal[])
      .filter((m) => m.match_zekerheid !== 'hoog' && !m.prijs)
      .slice(0, 2)
    if (onbekend.length > 0) {
      setVragen(onbekend)
      setVraagAntwoorden({})
    }
    setWerkbonMaken(false)
  }

  async function handleWerkbonOpslaan() {
    if (!bewerkWerkbon) return
    const supabase = createClient()
    await supabase.from('klussen').update({ werkbon_json: bewerkWerkbon }).eq('id', id)
    setKlus((prev) => prev ? { ...prev, werkbon_json: bewerkWerkbon } : prev)
    setWerkbonBewerken(false)
    setBewerkWerkbon(null)
  }

  async function handleFactuurMaken() {
    setFactuurMaken(true)
    setFout('')
    // Open window before async call — iOS blocks window.open after await
    const pdfVenster = window.open('', '_blank')
    const response = await fetch('/api/factuur-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klus_id: id }),
    })
    if (!response.ok) {
      pdfVenster?.close()
      const result = await response.json()
      setFout(result.fout ?? 'Factuur maken mislukt.')
      setFactuurMaken(false)
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (pdfVenster) pdfVenster.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    const supabase = createClient()
    const { data } = await supabase.from('facturen').select('id').eq('klus_id', id).order('aangemaakt_op', { ascending: false }).limit(1).single()
    if (data) setFactuurId(data.id)
    setFactuurMaken(false)
  }

  async function handleMailVersturen() {
    if (!factuurId) { setFout('Geen factuur gevonden. Maak eerst de PDF aan.'); return }
    setMailVersturen(true)
    setFout('')
    const response = await fetch('/api/factuur-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factuur_id: factuurId }),
    })
    const result = await response.json()
    if (!response.ok || result.fout) {
      setFout(`Mail mislukt: ${result.fout ?? response.status}`)
    } else {
      setMailVerzonden(true)
    }
    setMailVersturen(false)
  }

  if (laden) return <div className="p-4 md:p-8 text-gray-500">Laden...</div>
  if (!klus) return <div className="p-4 md:p-8 text-red-500">Klus niet gevonden.</div>

  const werkbon = klus.werkbon_json as Werkbon | null

  return (
    <div className="p-4 md:p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Klus</h1>
      {klant && <p className="text-gray-500 text-sm mb-6">Klant: {klant.naam}</p>}

      {!klus.transcriptie && <AudioOpnemer onKlaar={handleTranscriberen} bezig={transcriberen} />}
      {transcriberen && <div className="mt-6 text-[#f97316] text-sm animate-pulse">Spraak wordt omgezet naar tekst...</div>}
      {fout && <p className="text-red-500 text-sm mt-4">{fout}</p>}

      {klus.transcriptie && (
        <div className="mt-6 flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Transcriptie</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">{klus.transcriptie}</div>
          </div>

          {!werkbon && (
            <button onClick={handleWerkbonMaken} disabled={werkbonMaken} className="bg-[#f97316] text-white rounded-lg py-3 text-sm font-semibold hover:bg-orange-500 disabled:opacity-50">
              {werkbonMaken ? 'Werkbon wordt gemaakt...' : 'Maak werkbon →'}
            </button>
          )}

          {/* Vragen over onbekende materialen */}
          {vragen.length > 0 && (
            <div className="bg-[#1a2e4a] rounded-xl p-4 flex flex-col gap-4">
              <p className="text-white text-sm font-semibold">Wat heb je hiervoor betaald?</p>
              {vragen.map((m, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <label className="text-blue-200 text-sm">
                    {m.naam} ({m.aantal} {m.eenheid})
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={vraagAntwoorden[i] ?? ''}
                        onChange={(e) => setVraagAntwoorden({ ...vraagAntwoorden, [i]: e.target.value })}
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                      />
                    </div>
                    <span className="text-blue-300 text-xs self-center">/ {m.eenheid}</span>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 mt-1">
                <button
                  onClick={async () => {
                    const werkbonKopie = JSON.parse(JSON.stringify(werkbon)) as Werkbon
                    const supabase = createClient()
                    const { data: { user } } = await supabase.auth.getUser()
                    const { data: bedrijf } = user
                      ? await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
                      : { data: null }

                    for (let i = 0; i < vragen.length; i++) {
                      const v = vragen[i]
                      const prijs = parseFloat(vraagAntwoorden[i] ?? '')
                      if (isNaN(prijs)) continue

                      // Werkbon bijwerken
                      const idx = werkbonKopie.materialen.findIndex((m) => m.naam === v.naam)
                      if (idx >= 0) werkbonKopie.materialen[idx].prijs = prijs

                      // Automatisch opslaan in bibliotheek
                      if (bedrijf) {
                        const bestaand = bibliotheek.find((m) => m.naam.toLowerCase() === v.naam.toLowerCase())
                        if (bestaand) {
                          await supabase.from('materialen').update({
                            prijs,
                            laatste_inkoop_datum: new Date().toISOString().split('T')[0],
                          }).eq('id', bestaand.id)
                        } else {
                          await supabase.from('materialen').insert({
                            bedrijf_id: bedrijf.id,
                            naam: v.naam,
                            prijs,
                            eenheid: v.eenheid ?? 'stuk',
                            laatste_inkoop_datum: new Date().toISOString().split('T')[0],
                          })
                        }
                      }
                    }

                    await supabase.from('klussen').update({ werkbon_json: werkbonKopie }).eq('id', id)
                    setKlus((prev) => prev ? { ...prev, werkbon_json: werkbonKopie } : prev)
                    setVragen([])
                  }}
                  className="bg-[#f97316] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-orange-500"
                >
                  Opslaan
                </button>
                <button
                  onClick={() => setVragen([])}
                  className="text-blue-300 text-sm hover:text-white"
                >
                  Sla over
                </button>
              </div>
            </div>
          )}

          {werkbon && !werkbonBewerken && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-700">Werkbon</h2>
                <button
                  onClick={() => { setBewerkWerkbon(JSON.parse(JSON.stringify(werkbon))); setWerkbonBewerken(true) }}
                  className="text-sm text-[#f97316] hover:underline"
                >
                  Bewerken
                </button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
                <div><p className="text-xs text-gray-500">Omschrijving</p><p className="text-sm text-gray-900">{werkbon.omschrijving}</p></div>
                <div><p className="text-xs text-gray-500">Uren</p><p className="text-sm text-gray-900">{werkbon.uren} uur</p></div>
                {werkbon.materialen.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Materialen</p>
                    <ul className="flex flex-col gap-1">
                      {werkbon.materialen.map((m, i) => <li key={i} className="text-sm text-gray-900">{m.aantal} {m.eenheid} — {m.naam}</li>)}
                    </ul>
                  </div>
                )}
                <div><p className="text-xs text-gray-500">Voorrijkosten</p><p className="text-sm text-gray-900">{werkbon.voorrijkosten_meenemen ? 'Ja' : 'Nee'}</p></div>
                {werkbon.twijfels.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-xs font-medium text-yellow-800 mb-1">Opmerkingen</p>
                    {werkbon.twijfels.map((t, i) => <p key={i} className="text-xs text-yellow-700">{t}</p>)}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <button onClick={handleFactuurMaken} disabled={factuurMaken} className="bg-[#f97316] text-white rounded-lg py-3 text-sm font-semibold hover:bg-orange-500 disabled:opacity-50 w-full">
                  {factuurMaken ? 'Factuur wordt gemaakt...' : '📄 Factuur downloaden'}
                </button>
                {factuurId && !mailVerzonden && (
                  <button onClick={handleMailVersturen} disabled={mailVersturen} className="bg-[#1a2e4a] text-white rounded-lg py-3 text-sm font-semibold hover:bg-[#223a5e] disabled:opacity-50 w-full">
                    {mailVersturen ? 'Mail wordt verstuurd...' : '✉️ Factuur mailen naar klant'}
                  </button>
                )}
                {mailVerzonden && <p className="text-green-600 text-sm text-center">✓ Factuur verstuurd naar {klant?.email}</p>}
              </div>
            </div>
          )}

          {werkbon && werkbonBewerken && bewerkWerkbon && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-700">Werkbon bewerken</h2>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Omschrijving</label>
                  <textarea
                    value={bewerkWerkbon.omschrijving}
                    onChange={(e) => setBewerkWerkbon({ ...bewerkWerkbon, omschrijving: e.target.value })}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Uren</label>
                  <input
                    type="number"
                    value={bewerkWerkbon.uren}
                    onChange={(e) => setBewerkWerkbon({ ...bewerkWerkbon, uren: parseFloat(e.target.value) })}
                    step="0.5"
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Materialen</label>
                  <div className="flex flex-col gap-2">
                    {bewerkWerkbon.materialen.map((m, i) => (
                      <div key={i} className="flex flex-col gap-1.5 bg-gray-50 rounded-lg p-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={m.naam}
                            placeholder="Naam materiaal"
                            onChange={(e) => {
                              const nieuw = [...bewerkWerkbon.materialen]
                              nieuw[i] = { ...m, naam: e.target.value }
                              setBewerkWerkbon({ ...bewerkWerkbon, materialen: nieuw })
                            }}
                            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          />
                          <button
                            onClick={() => setBewerkWerkbon({ ...bewerkWerkbon, materialen: bewerkWerkbon.materialen.filter((_, j) => j !== i) })}
                            className="text-red-400 hover:text-red-600 text-sm px-1"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={m.aantal}
                            placeholder="Aantal"
                            onChange={(e) => {
                              const nieuw = [...bewerkWerkbon.materialen]
                              nieuw[i] = { ...m, aantal: parseFloat(e.target.value) }
                              setBewerkWerkbon({ ...bewerkWerkbon, materialen: nieuw })
                            }}
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                            min="0"
                          />
                          <input
                            type="text"
                            value={m.eenheid}
                            placeholder="stuk"
                            onChange={(e) => {
                              const nieuw = [...bewerkWerkbon.materialen]
                              nieuw[i] = { ...m, eenheid: e.target.value }
                              setBewerkWerkbon({ ...bewerkWerkbon, materialen: nieuw })
                            }}
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          />
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                            <input
                              type="number"
                              value={m.prijs ?? ''}
                              placeholder="0,00"
                              onChange={(e) => {
                                const nieuw = [...bewerkWerkbon.materialen]
                                nieuw[i] = { ...m, prijs: parseFloat(e.target.value) || 0 }
                                setBewerkWerkbon({ ...bewerkWerkbon, materialen: nieuw })
                              }}
                              className="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-1.5 text-sm"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {zoekOpen ? (
                      <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden">
                        <input
                          autoFocus
                          type="text"
                          value={materiaalZoek}
                          onChange={(e) => setMateriaalZoek(e.target.value)}
                          placeholder="Zoek in bibliotheek..."
                          className="w-full px-3 py-2 text-sm focus:outline-none border-b border-gray-200"
                        />
                        <div className="max-h-40 overflow-y-auto">
                          {bibliotheek
                            .filter((m) => m.naam.toLowerCase().includes(materiaalZoek.toLowerCase()))
                            .map((m) => {
                              const leeftijd = prijsDot(m.laatste_inkoop_datum)
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setBewerkWerkbon({ ...bewerkWerkbon, materialen: [...bewerkWerkbon.materialen, { naam: m.naam, aantal: 1, eenheid: m.eenheid, prijs: m.prijs }] })
                                    setZoekOpen(false)
                                    setMateriaalZoek('')
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex justify-between items-center gap-2"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${leeftijd.dot}`} title={leeftijd.tekst} />
                                    <span className="truncate">{m.naam}</span>
                                  </div>
                                  <span className="text-gray-400 text-xs shrink-0">€ {Number(m.prijs).toFixed(2).replace('.', ',')} / {m.eenheid}</span>
                                </button>
                              )
                            })}
                          {bibliotheek.filter((m) => m.naam.toLowerCase().includes(materiaalZoek.toLowerCase())).length === 0 && (
                            <p className="px-3 py-2 text-sm text-gray-400">Niet gevonden</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBewerkWerkbon({ ...bewerkWerkbon, materialen: [...bewerkWerkbon.materialen, { naam: materiaalZoek, aantal: 1, eenheid: 'stuk', prijs: 0 }] })
                            setZoekOpen(false)
                            setMateriaalZoek('')
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-[#f97316] border-t border-gray-200 hover:bg-orange-50"
                        >
                          + Handmatig toevoegen{materiaalZoek ? `: "${materiaalZoek}"` : ''}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setZoekOpen(true)}
                        className="text-sm text-[#f97316] hover:underline text-left mt-1"
                      >
                        + Materiaal toevoegen
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Voorrijkosten</label>
                  <select
                    value={bewerkWerkbon.voorrijkosten_meenemen ? 'ja' : 'nee'}
                    onChange={(e) => setBewerkWerkbon({ ...bewerkWerkbon, voorrijkosten_meenemen: e.target.value === 'ja' })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                  >
                    <option value="ja">Ja</option>
                    <option value="nee">Nee</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleWerkbonOpslaan} className="bg-[#f97316] text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-orange-500">
                  Opslaan
                </button>
                <button onClick={() => { setWerkbonBewerken(false); setBewerkWerkbon(null) }} className="text-sm text-gray-500 hover:text-gray-700">
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AudioOpnemer({ onKlaar, bezig }: { onKlaar: (blob: Blob) => void; bezig: boolean }) {
  const [status, setStatus] = useState<'idle' | 'opnemen' | 'klaar'>('idle')
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(
      (t) => MediaRecorder.isTypeSupported(t)
    ) ?? ''
    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
      blobRef.current = blob
      setAudioBlobUrl(URL.createObjectURL(blob))
      setStatus('klaar')
      stream.getTracks().forEach((t) => t.stop())
    }
    mediaRecorder.start()
    setStatus('opnemen')
  }

  function stop() { mediaRecorderRef.current?.stop() }
  function opnieuw() { setStatus('idle'); setAudioBlobUrl(null); blobRef.current = null }

  return (
    <div className="flex flex-col gap-4">
      {status === 'idle' && <button onClick={start} disabled={bezig} className="bg-red-500 text-white rounded-xl px-6 py-5 text-lg font-semibold hover:bg-red-600 w-full">🎙️ Start opname</button>}
      {status === 'opnemen' && <button onClick={stop} className="bg-gray-800 text-white rounded-xl px-6 py-5 text-lg font-semibold w-full animate-pulse">⏹️ Stop opname</button>}
      {status === 'klaar' && audioBlobUrl && (
        <div className="flex flex-col gap-3">
          <audio controls src={audioBlobUrl} className="w-full" />
          <div className="flex gap-3">
            <button onClick={() => blobRef.current && onKlaar(blobRef.current)} disabled={bezig} className="bg-[#f97316] text-white rounded-lg px-5 py-2 text-sm font-semibold hover:bg-orange-500 disabled:opacity-50">
              {bezig ? 'Bezig...' : 'Omzetten naar tekst →'}
            </button>
            <button onClick={opnieuw} className="text-sm text-gray-500 hover:text-gray-700">Opnieuw</button>
          </div>
        </div>
      )}
    </div>
  )
}
