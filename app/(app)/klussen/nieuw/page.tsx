'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Klant } from '@/types'

type OpnameStatus = 'idle' | 'opnemen' | 'klaar'

export default function NieuweKlusPage() {
  const router = useRouter()
  const [klanten, setKlanten] = useState<Klant[]>([])
  const [gekozenKlantId, setGekozenKlantId] = useState('')
  const [opnameStatus, setOpnameStatus] = useState<OpnameStatus>('idle')
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null)
  const [opslaan, setOpslaan] = useState(false)
  const [stap, setStap] = useState('Opslaan...')
  const [fout, setFout] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioBlobRef = useRef<Blob | null>(null)

  useEffect(() => {
    laadKlanten()
  }, [])

  async function laadKlanten() {
    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { setFout('Niet ingelogd.'); return }

    const { data: bedrijf, error: bedrijfError } = await supabase
      .from('bedrijven')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (bedrijfError) { setFout('Fout bij laden bedrijf: ' + bedrijfError.message); return }
    if (!bedrijf) { setFout('Geen bedrijf gevonden. Sla eerst je bedrijfsgegevens op.'); return }

    const { data, error: klantenError } = await supabase
      .from('klanten')
      .select('*')
      .eq('bedrijf_id', bedrijf.id)
      .order('naam')

    if (klantenError) { setFout('Fout bij laden klanten: ' + klantenError.message); return }
    setKlanten(data ?? [])
  }

  async function startOpname() {
    setFout('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (t) => MediaRecorder.isTypeSupported(t)
      ) ?? ''
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        audioBlobRef.current = blob
        setAudioBlobUrl(URL.createObjectURL(blob))
        setOpnameStatus('klaar')
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setOpnameStatus('opnemen')
    } catch {
      setFout('Geen toegang tot microfoon. Geef toestemming in je browser.')
    }
  }

  function stopOpname() {
    mediaRecorderRef.current?.stop()
  }

  function opnameOpnieuw() {
    setAudioBlobUrl(null)
    audioBlobRef.current = null
    setOpnameStatus('idle')
  }

  async function handleOpslaan() {
    if (!gekozenKlantId) {
      setFout('Kies eerst een klant.')
      return
    }
    if (!audioBlobRef.current) {
      setFout('Neem eerst audio op.')
      return
    }

    setOpslaan(true)
    setFout('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: bedrijf } = await supabase
      .from('bedrijven')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!bedrijf) {
      setFout('Sla eerst je bedrijfsgegevens op.')
      setOpslaan(false)
      return
    }

    const { data: klus, error } = await supabase
      .from('klussen')
      .insert({
        bedrijf_id: bedrijf.id,
        klant_id: gekozenKlantId,
        status: 'nieuw',
      })
      .select()
      .single()

    if (error || !klus) {
      setFout('Er ging iets mis. Probeer opnieuw.')
      setOpslaan(false)
      return
    }

    // Meteen transcriberen
    setStap('Spraak omzetten naar tekst...')
    const ext = audioBlobRef.current.type.includes('mp4') ? 'mp4' : audioBlobRef.current.type.includes('ogg') ? 'ogg' : 'webm'
    const formData = new FormData()
    formData.append('audio', audioBlobRef.current, `opname.${ext}`)

    const transcriptieResponse = await fetch('/api/transcribe', { method: 'POST', body: formData })
    const transcriptieResult = await transcriptieResponse.json()

    if (transcriptieResponse.ok && transcriptieResult.tekst) {
      await supabase
        .from('klussen')
        .update({ transcriptie: transcriptieResult.tekst, status: 'getranscribeerd' })
        .eq('id', klus.id)
    }

    router.push(`/klussen/${klus.id}`)
  }

  return (
    <div className="p-4 md:p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nieuwe klus</h1>
      <p className="text-gray-500 text-sm mb-6">Kies een klant en neem je klus in.</p>

      <div className="flex flex-col gap-6">
        {/* Klant kiezen */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Klant</label>
          <select
            value={gekozenKlantId}
            onChange={(e) => setGekozenKlantId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316]"
          >
            <option value="">-- Kies een klant --</option>
            {klanten.map((klant) => (
              <option key={klant.id} value={klant.id}>
                {klant.naam} {klant.plaats ? `— ${klant.plaats}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Checklist */}
        <div className="bg-[#1a2e4a] rounded-xl p-4">
          <p className="text-sm font-semibold text-white mb-2">Vergeet dit niet te benoemen:</p>
          <ul className="flex flex-col gap-1">
            {[
              'Wat heb je gedaan?',
              'Hoeveel uur heb je gewerkt?',
              'Met hoeveel man?',
              'Welke materialen heb je gebruikt?',
              'Ben je voorgereden?',
            ].map((item) => (
              <li key={item} className="text-sm text-blue-200 flex items-center gap-2">
                <span className="text-[#f97316]">•</span> {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Audio opnemen */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Klus inspreken</label>

          {opnameStatus === 'idle' && (
            <button
              onClick={startOpname}
              className="flex items-center gap-3 bg-red-500 text-white rounded-xl px-6 py-5 text-lg font-semibold hover:bg-red-600 w-full justify-center"
            >
              🎙️ Start opname
            </button>
          )}

          {opnameStatus === 'opnemen' && (
            <button
              onClick={stopOpname}
              className="flex items-center gap-3 bg-gray-800 text-white rounded-xl px-6 py-5 text-lg font-semibold hover:bg-gray-900 w-full justify-center animate-pulse"
            >
              ⏹️ Stop opname
            </button>
          )}

          {opnameStatus === 'klaar' && audioBlobUrl && (
            <div className="flex flex-col gap-3">
              <audio controls src={audioBlobUrl} className="w-full" />
              <button
                onClick={opnameOpnieuw}
                className="text-sm text-gray-500 hover:text-gray-700 text-left"
              >
                Opnieuw opnemen
              </button>
            </div>
          )}
        </div>

        {fout && <p className="text-red-500 text-sm">{fout}</p>}

        <button
          onClick={handleOpslaan}
          disabled={opslaan || opnameStatus !== 'klaar'}
          className="bg-[#f97316] text-white rounded-lg py-3 text-sm font-semibold hover:bg-orange-500 disabled:opacity-40"
        >
          {opslaan ? stap : 'Klus opslaan →'}
        </button>
      </div>
    </div>
  )
}
