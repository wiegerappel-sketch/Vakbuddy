'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Stap = 'welkom' | 'opnemen' | 'verwerken' | 'transcriptie' | 'extraheren' | 'bevestigen'

type Extractie = {
  bedrijf: { naam: string | null; telefoon: string | null; email: string | null; adres: string | null }
  tarieven: { uurloon: number | null; voorrijkosten: number | null; btw_percentage: number | null }
  gevonden: string[]
  ontbrekend_kritisch: string[]
}

function VeldRij({
  label, waarde, onChange, gevonden, type = 'text', placeholder = '', verplicht = false,
}: {
  label: string; waarde: string; onChange: (v: string) => void
  gevonden: boolean; type?: string; placeholder?: string; verplicht?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {gevonden
          ? <span className="text-xs text-green-600 font-medium">✓ herkend</span>
          : verplicht
            ? <span className="text-xs text-red-500 font-medium">verplicht</span>
            : <span className="text-xs text-gray-400">niet gevonden</span>}
      </div>
      <input
        type={type}
        value={waarde}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] ${
          gevonden ? 'border-green-300 bg-green-50'
          : verplicht && !waarde ? 'border-red-300 bg-red-50'
          : 'border-gray-300'
        }`}
      />
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [stap, setStap] = useState<Stap>('welkom')
  const [opneemStatus, setOpneemStatus] = useState<'idle' | 'opnemen' | 'klaar'>('idle')
  const [transcriptie, setTranscriptie] = useState('')
  const [extractie, setExtractie] = useState<Extractie | null>(null)
  const [fout, setFout] = useState('')
  const [opslaan, setOpslaan] = useState(false)

  // Formuliervelden
  const [naam, setNaam] = useState('')
  const [telefoon, setTelefoon] = useState('')
  const [email, setEmail] = useState('')
  const [adres, setAdres] = useState('')
  const [kvk, setKvk] = useState('')
  const [btwNummer, setBtwNummer] = useState('')
  const [iban, setIban] = useState('')
  const [uurloon, setUurloon] = useState('65')
  const [voorrijkosten, setVoorrijkosten] = useState('25')
  const [btwPercentage, setBtwPercentage] = useState('21')

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
    setStap('welkom')
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

  async function extraheer() {
    setStap('extraheren')
    setFout('')

    const res = await fetch('/api/onboarding-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptie }),
    })
    const data = await res.json()

    if (!res.ok || data.fout) {
      setFout(data.fout ?? 'Extractie mislukt.')
      setStap('transcriptie')
      return
    }

    const ext: Extractie = data.extractie
    setExtractie(ext)

    if (ext.bedrijf.naam) setNaam(ext.bedrijf.naam)
    if (ext.bedrijf.telefoon) setTelefoon(ext.bedrijf.telefoon)
    if (ext.bedrijf.email) setEmail(ext.bedrijf.email)
    if (ext.bedrijf.adres) setAdres(ext.bedrijf.adres)
    if (ext.tarieven.uurloon) setUurloon(String(ext.tarieven.uurloon))
    if (ext.tarieven.voorrijkosten) setVoorrijkosten(String(ext.tarieven.voorrijkosten))
    if (ext.tarieven.btw_percentage) setBtwPercentage(String(ext.tarieven.btw_percentage))

    setStap('bevestigen')
  }

  async function handleOpslaan(e: React.FormEvent) {
    e.preventDefault()
    if (!naam || !kvk || !btwNummer || !iban) {
      setFout('Vul alle verplichte velden in (naam, KVK, BTW-nummer, IBAN).')
      return
    }
    setOpslaan(true)
    setFout('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFout('Niet ingelogd.'); setOpslaan(false); return }

    const { data: bestaand } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    const bedrijfWaarden = { naam, kvk, btw_nummer: btwNummer, iban, adres, telefoon, email, user_id: user.id }
    let bedrijfId: string

    if (bestaand) {
      await supabase.from('bedrijven').update(bedrijfWaarden).eq('id', bestaand.id)
      bedrijfId = bestaand.id
    } else {
      const { data: nieuw } = await supabase.from('bedrijven').insert(bedrijfWaarden).select('id').single()
      if (!nieuw) { setFout('Opslaan mislukt.'); setOpslaan(false); return }
      bedrijfId = nieuw.id
    }

    const { data: bestaandTarief } = await supabase.from('tarieven').select('id').eq('bedrijf_id', bedrijfId).maybeSingle()
    const tarievenWaarden = {
      bedrijf_id: bedrijfId,
      uurloon: parseFloat(uurloon) || 65,
      voorrijkosten: parseFloat(voorrijkosten) || 25,
      btw_percentage: parseFloat(btwPercentage) || 21,
    }

    if (bestaandTarief) {
      await supabase.from('tarieven').update(tarievenWaarden).eq('id', bestaandTarief.id)
    } else {
      await supabase.from('tarieven').insert(tarievenWaarden)
    }

    router.push('/dashboard')
  }

  const gevonden = extractie?.gevonden ?? []

  return (
    <div className="min-h-screen bg-[#1a2e4a] flex flex-col items-center justify-center px-6 py-12">

      {stap === 'welkom' && (
        <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-3">Welkom bij Vakbuddy</h1>
            <p className="text-blue-200 text-base leading-relaxed">
              Vertel ons in 2 minuten over je bedrijf. Je naam, wat je doet, je tarieven — wij vullen de rest.
            </p>
          </div>

          <button onClick={startOpname}
            className="w-full bg-[#f97316] hover:bg-orange-500 text-white rounded-2xl py-6 text-xl font-bold flex items-center justify-center gap-3 transition-colors">
            <span className="text-2xl">🎙️</span> Opnemen
          </button>

          <div className="bg-[#243d5c] rounded-xl p-4 w-full text-left">
            <p className="text-blue-200 text-xs font-semibold uppercase tracking-wide mb-2">Vertel bijv. dit:</p>
            <ul className="flex flex-col gap-1.5">
              {['Je naam en bedrijfsnaam', 'Wat je doet (loodgieter, elektricien...)', 'Je uurloon en voorrijkosten', 'Je werkgebied', 'Hoe je factureert'].map((item) => (
                <li key={item} className="text-sm text-blue-100 flex items-start gap-2">
                  <span className="text-[#f97316] mt-0.5">•</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {fout && <p className="text-red-400 text-sm">{fout}</p>}
          <Link href="/instellingen" className="text-blue-300 text-sm hover:text-white underline">Liever handmatig invullen →</Link>
        </div>
      )}

      {stap === 'opnemen' && (
        <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {opneemStatus === 'opnemen' ? 'Aan het opnemen...' : 'Klaar!'}
            </h2>
            <p className="text-blue-200 text-sm">
              {opneemStatus === 'opnemen' ? 'Vertel rustig over je bedrijf. Druk op stop als je klaar bent.' : 'Luister terug of ga verder.'}
            </p>
          </div>

          {opneemStatus === 'opnemen' && (
            <button onClick={stopOpname}
              className="w-32 h-32 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors animate-pulse">
              <span className="text-4xl">⏹️</span>
            </button>
          )}

          {opneemStatus === 'klaar' && audioBlobUrl && (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-2xl">✓</div>
              <audio controls src={audioBlobUrl} className="w-full rounded-lg" />
              <div className="flex flex-col gap-3 w-full">
                <button onClick={verstuurNaarWhisper}
                  className="w-full bg-[#f97316] hover:bg-orange-500 text-white rounded-xl py-4 text-base font-bold transition-colors">
                  Verder →
                </button>
                <button onClick={opnameOpnieuw} className="text-sm text-blue-300 hover:text-white">Opnieuw opnemen</button>
              </div>
            </div>
          )}

          {fout && <p className="text-red-400 text-sm">{fout}</p>}
        </div>
      )}

      {(stap === 'verwerken' || stap === 'extraheren') && (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="w-16 h-16 border-4 border-blue-300 border-t-[#f97316] rounded-full animate-spin" />
          <div>
            <p className="text-white text-lg font-semibold">
              {stap === 'verwerken' ? 'We luisteren mee...' : 'Gegevens ophalen...'}
            </p>
            <p className="text-blue-200 text-sm mt-1">Even geduld, dit duurt maar een paar seconden.</p>
          </div>
        </div>
      )}

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

          {fout && <p className="text-red-400 text-sm text-center">{fout}</p>}

          <div className="flex flex-col gap-3">
            <button onClick={extraheer}
              className="w-full bg-[#f97316] hover:bg-orange-500 text-white rounded-xl py-4 text-base font-bold text-center transition-colors">
              Gegevens ophalen →
            </button>
            <button onClick={opnameOpnieuw} className="text-sm text-blue-300 hover:text-white text-center">Opnieuw opnemen</button>
          </div>
        </div>
      )}

      {stap === 'bevestigen' && (
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Klopt dit allemaal?</h2>
            <p className="text-blue-200 text-sm">Controleer en vul aan. <span className="text-green-400">Groen = herkend.</span></p>
          </div>

          <form onSubmit={handleOpslaan} className="flex flex-col gap-4">
            <div className="bg-white rounded-xl p-4 flex flex-col gap-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bedrijfsgegevens</p>
              <VeldRij label="Bedrijfsnaam" waarde={naam} onChange={setNaam} gevonden={gevonden.includes('naam')} verplicht placeholder="Jansen Loodgietersbedrijf" />
              <VeldRij label="Telefoonnummer" waarde={telefoon} onChange={setTelefoon} gevonden={gevonden.includes('telefoon')} placeholder="06-12345678" />
              <VeldRij label="E-mailadres" waarde={email} onChange={setEmail} gevonden={gevonden.includes('email')} type="email" placeholder="jan@jansen.nl" />
              <VeldRij label="Adres" waarde={adres} onChange={setAdres} gevonden={gevonden.includes('adres')} placeholder="Straat 1, 1234 AB Stad" />
            </div>

            <div className="bg-white rounded-xl p-4 flex flex-col gap-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tarieven</p>
              <VeldRij label="Uurloon (€)" waarde={uurloon} onChange={setUurloon} gevonden={gevonden.includes('uurloon')} type="number" placeholder="65" />
              <VeldRij label="Voorrijkosten (€)" waarde={voorrijkosten} onChange={setVoorrijkosten} gevonden={gevonden.includes('voorrijkosten')} type="number" placeholder="25" />
              <VeldRij label="BTW (%)" waarde={btwPercentage} onChange={setBtwPercentage} gevonden={gevonden.includes('btw_percentage')} type="number" placeholder="21" />
            </div>

            <div className="bg-[#243d5c] rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-blue-200 uppercase tracking-wide">Nog even invullen</p>
              <p className="text-xs text-blue-300">Dit kun je beter typen dan inspreken.</p>
              <VeldRij label="KVK-nummer" waarde={kvk} onChange={setKvk} gevonden={false} verplicht placeholder="12345678" />
              <VeldRij label="BTW-nummer" waarde={btwNummer} onChange={setBtwNummer} gevonden={false} verplicht placeholder="NL123456789B01" />
              <VeldRij label="IBAN" waarde={iban} onChange={setIban} gevonden={false} verplicht placeholder="NL00 BANK 0000 0000 00" />
            </div>

            {fout && <p className="text-red-400 text-sm text-center">{fout}</p>}

            <button type="submit" disabled={opslaan}
              className="w-full bg-[#f97316] hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl py-4 text-base font-bold transition-colors">
              {opslaan ? 'Opslaan...' : 'Account instellen →'}
            </button>
          </form>
        </div>
      )}

    </div>
  )
}
