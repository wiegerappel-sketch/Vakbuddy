'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

type Stap = 'welkom' | 'opnemen' | 'verwerken' | 'transcriptie'

export default function OnboardingPage() {
  const [stap, setStap] = useState<Stap>('welkom')
  const [opneemStatus, setOpneemStatus] = useState<'idle' | 'opnemen' | 'klaar'>('idle')
  const [transcriptie, setTranscriptie] = useState('')
  const [fout, setFout] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioBlobRef = useRef<Blob | null>(null)
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null)

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
        setOpneemStatus('klaar')
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setOpneemStatus('opnemen')
      setStap('opnemen')
    } catch {
      setFout('Geen toegang tot microfoon. Geef toestemming in je browser.')
    }
  }

  function stopOpname() {
    mediaRecorderRef.current?.stop()
  }

  function opnameOpnieuw() {
    audioBlobRef.current = null
    setAudioBlobUrl(null)
    setOpneemStatus('idle')
    setTranscriptie('')
    setFout('')
  }

  async function verstuurNaarWhisper() {
    if (!audioBlobRef.current) return
    setStap('verwerken')
    setFout('')

    const ext = audioBlobRef.current.type.includes('mp4') ? 'mp4'
      : audioBlobRef.current.type.includes('ogg') ? 'ogg' : 'webm'
    const form = new FormData()
    form.append('audio', audioBlobRef.current, `opname.${ext}`)

    const res = await fetch('/api/transcribe', { method: 'POST', body: form })
    const data = await res.json()

    if (!res.ok || !data.tekst) {
      setFout(data.fout ?? 'Transcriptie mislukt. Probeer opnieuw.')
      setStap('opnemen')
      return
    }

    setTranscriptie(data.tekst)
    setStap('transcriptie')
  }

  return (
    <div className="min-h-screen bg-[#1a2e4a] flex flex-col items-center justify-center px-6 py-12">

      {/* Welkom */}
      {stap === 'welkom' && (
        <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-3">Welkom bij Vakbuddy</h1>
            <p className="text-blue-200 text-base leading-relaxed">
              Vertel ons in 2 minuten over je bedrijf. Je naam, wat je doet, je tarieven — wij vullen de rest.
            </p>
          </div>

          <button
            onClick={startOpname}
            className="w-full bg-[#f97316] hover:bg-orange-500 text-white rounded-2xl py-6 text-xl font-bold flex items-center justify-center gap-3 transition-colors"
          >
            <span className="text-2xl">🎙️</span> Opnemen
          </button>

          <div className="bg-[#243d5c] rounded-xl p-4 w-full text-left">
            <p className="text-blue-200 text-xs font-semibold uppercase tracking-wide mb-2">Vertel bijv. dit:</p>
            <ul className="flex flex-col gap-1.5">
              {[
                'Je naam en bedrijfsnaam',
                'Wat je doet (loodgieter, elektricien...)',
                'Je uurloon en voorrijkosten',
                'Je werkgebied',
                'Hoe je factureert',
              ].map((item) => (
                <li key={item} className="text-sm text-blue-100 flex items-start gap-2">
                  <span className="text-[#f97316] mt-0.5">•</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {fout && <p className="text-red-400 text-sm">{fout}</p>}

          <Link href="/instellingen" className="text-blue-300 text-sm hover:text-white underline">
            Liever handmatig invullen →
          </Link>
        </div>
      )}

      {/* Opnemen */}
      {stap === 'opnemen' && (
        <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Aan het opnemen...</h2>
            <p className="text-blue-200 text-sm">Vertel rustig over je bedrijf. Druk op stop als je klaar bent.</p>
          </div>

          {opneemStatus === 'opnemen' && (
            <button
              onClick={stopOpname}
              className="w-32 h-32 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors animate-pulse"
            >
              <span className="text-4xl">⏹️</span>
            </button>
          )}

          {opneemStatus === 'klaar' && audioBlobUrl && (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-2xl">✓</div>
              <audio controls src={audioBlobUrl} className="w-full rounded-lg" />
              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={verstuurNaarWhisper}
                  className="w-full bg-[#f97316] hover:bg-orange-500 text-white rounded-xl py-4 text-base font-bold transition-colors"
                >
                  Verder →
                </button>
                <button onClick={opnameOpnieuw} className="text-sm text-blue-300 hover:text-white">
                  Opnieuw opnemen
                </button>
              </div>
            </div>
          )}

          {fout && <p className="text-red-400 text-sm">{fout}</p>}
        </div>
      )}

      {/* Verwerken */}
      {stap === 'verwerken' && (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="w-16 h-16 border-4 border-blue-300 border-t-[#f97316] rounded-full animate-spin" />
          <div>
            <p className="text-white text-lg font-semibold">We luisteren mee...</p>
            <p className="text-blue-200 text-sm mt-1">Even geduld, dit duurt maar een paar seconden.</p>
          </div>
        </div>
      )}

      {/* Transcriptie */}
      {stap === 'transcriptie' && (
        <div className="flex flex-col gap-6 max-w-sm w-full">
          <div className="text-center">
            <div className="text-3xl mb-2">✓</div>
            <h2 className="text-2xl font-bold text-white mb-1">Goed gehoord!</h2>
            <p className="text-blue-200 text-sm">Dit hebben we verstaan:</p>
          </div>

          <div className="bg-white rounded-xl p-4">
            <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{transcriptie}</p>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/instellingen"
              className="w-full bg-[#f97316] hover:bg-orange-500 text-white rounded-xl py-4 text-base font-bold text-center transition-colors"
            >
              Instellingen controleren →
            </Link>
            <button onClick={opnameOpnieuw} className="text-sm text-blue-300 hover:text-white text-center">
              Opnieuw opnemen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
