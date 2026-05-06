'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Klant, Klus } from '@/types'

type Materiaal = { naam: string; aantal: number; eenheid: string }

type Werkbon = {
  omschrijving: string
  uren: number
  materialen: Materiaal[]
  voorrijkosten_meenemen: boolean
  twijfels: string[]
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
    setLaden(false)
  }

  async function handleTranscriberen(audioBlob: Blob) {
    setTranscriberen(true)
    setFout('')
    const formData = new FormData()
    formData.append('audio', audioBlob, 'opname.webm')
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
      body: JSON.stringify({ transcriptie: klus.transcriptie }),
    })
    const result = await response.json()
    if (!response.ok || result.fout) { setFout(result.fout ?? 'Werkbon maken mislukt.'); setWerkbonMaken(false); return }
    const supabase = createClient()
    await supabase.from('klussen').update({ werkbon_json: result.werkbon, status: 'werkbon_klaar' }).eq('id', id)
    setKlus((prev) => prev ? { ...prev, werkbon_json: result.werkbon, status: 'werkbon_klaar' } : prev)
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
    const response = await fetch('/api/factuur-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klus_id: id }),
    })
    if (!response.ok) { const result = await response.json(); setFout(result.fout ?? 'Factuur maken mislukt.'); setFactuurMaken(false); return }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'factuur.pdf'; a.click()
    URL.revokeObjectURL(url)
    const supabase = createClient()
    const { data } = await supabase.from('facturen').select('id').eq('klus_id', id).order('aangemaakt_op', { ascending: false }).limit(1).single()
    if (data) setFactuurId(data.id)
    setFactuurMaken(false)
  }

  async function handleMailVersturen() {
    if (!factuurId) return
    setMailVersturen(true)
    setFout('')
    const response = await fetch('/api/factuur-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factuur_id: factuurId }),
    })
    const result = await response.json()
    if (!response.ok || result.fout) { setFout(result.fout ?? 'Mail versturen mislukt.') } else { setMailVerzonden(true) }
    setMailVersturen(false)
  }

  if (laden) return <div className="p-8 text-gray-500">Laden...</div>
  if (!klus) return <div className="p-8 text-red-500">Klus niet gevonden.</div>

  const werkbon = klus.werkbon_json as Werkbon | null

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Klus</h1>
      {klant && <p className="text-gray-500 text-sm mb-6">Klant: {klant.naam}</p>}

      {!klus.transcriptie && <AudioOpnemer onKlaar={handleTranscriberen} bezig={transcriberen} />}
      {transcriberen && <div className="mt-6 text-blue-600 text-sm animate-pulse">Spraak wordt omgezet naar tekst...</div>}
      {fout && <p className="text-red-500 text-sm mt-4">{fout}</p>}

      {klus.transcriptie && (
        <div className="mt-6 flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-2">Transcriptie</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">{klus.transcriptie}</div>
          </div>

          {!werkbon && (
            <button onClick={handleWerkbonMaken} disabled={werkbonMaken} className="bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {werkbonMaken ? 'Werkbon wordt gemaakt...' : 'Maak werkbon →'}
            </button>
          )}

          {werkbon && !werkbonBewerken && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-700">Werkbon</h2>
                <button
                  onClick={() => { setBewerkWerkbon(JSON.parse(JSON.stringify(werkbon))); setWerkbonBewerken(true) }}
                  className="text-sm text-blue-600 hover:underline"
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
                <button onClick={handleFactuurMaken} disabled={factuurMaken} className="bg-green-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-700 disabled:opacity-50 w-full">
                  {factuurMaken ? 'Factuur wordt gemaakt...' : '📄 Factuur downloaden'}
                </button>
                {factuurId && !mailVerzonden && (
                  <button onClick={handleMailVersturen} disabled={mailVersturen} className="bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 w-full">
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Materialen</label>
                  <div className="flex flex-col gap-2">
                    {bewerkWerkbon.materialen.map((m, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={m.aantal}
                          onChange={(e) => {
                            const nieuw = [...bewerkWerkbon.materialen]
                            nieuw[i] = { ...m, aantal: parseFloat(e.target.value) }
                            setBewerkWerkbon({ ...bewerkWerkbon, materialen: nieuw })
                          }}
                          className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          min="0"
                        />
                        <input
                          type="text"
                          value={m.naam}
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
                    ))}
                    <button
                      onClick={() => setBewerkWerkbon({ ...bewerkWerkbon, materialen: [...bewerkWerkbon.materialen, { naam: '', aantal: 1, eenheid: 'stuk' }] })}
                      className="text-sm text-blue-600 hover:underline text-left"
                    >
                      + Materiaal toevoegen
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Voorrijkosten</label>
                  <select
                    value={bewerkWerkbon.voorrijkosten_meenemen ? 'ja' : 'nee'}
                    onChange={(e) => setBewerkWerkbon({ ...bewerkWerkbon, voorrijkosten_meenemen: e.target.value === 'ja' })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ja">Ja</option>
                    <option value="nee">Nee</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleWerkbonOpslaan} className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700">
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
    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
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
      {status === 'idle' && <button onClick={start} disabled={bezig} className="bg-red-500 text-white rounded-xl px-6 py-4 text-base font-medium hover:bg-red-600 w-full">🎙️ Start opname</button>}
      {status === 'opnemen' && <button onClick={stop} className="bg-gray-800 text-white rounded-xl px-6 py-4 text-base font-medium w-full animate-pulse">⏹️ Stop opname</button>}
      {status === 'klaar' && audioBlobUrl && (
        <div className="flex flex-col gap-3">
          <audio controls src={audioBlobUrl} className="w-full" />
          <div className="flex gap-3">
            <button onClick={() => blobRef.current && onKlaar(blobRef.current)} disabled={bezig} className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {bezig ? 'Bezig...' : 'Omzetten naar tekst →'}
            </button>
            <button onClick={opnieuw} className="text-sm text-gray-500 hover:text-gray-700">Opnieuw</button>
          </div>
        </div>
      )}
    </div>
  )
}
