'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type UploadBestand = {
  id: string
  bestandsnaam: string
  type: string
  classificatie: string | null
  fout_melding: string | null
  verwerkt_op: string | null
}

type UploadBatch = {
  id: string
  status: string
  totaal_bestanden: number
  verwerkt: number
  gestart_op: string
}

type BestandRij = {
  naam: string
  bestand: File
  status: 'wacht' | 'bezig' | 'klaar' | 'fout'
  fout?: string
}

type Regel = {
  omschrijving: string
  artikelnummer: string | null
  aantal: number
  eenheid: string
  prijs_per_eenheid: number
}

type VerwerkResultaat = {
  bestand_id: string
  classificatie: string
  leverancier?: string
  factuurdatum?: string
  regels?: Regel[]
  reden?: string
  fout?: string
}

export default function BulkImportPage() {
  const [batches, setBatches] = useState<UploadBatch[]>([])
  const [bestanden, setBestanden] = useState<UploadBestand[]>([])
  const [gekozenBatchId, setGekozenBatchId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [rijen, setRijen] = useState<BestandRij[]>([])
  const [slepen, setSlepen] = useState(false)
  const [laden, setLaden] = useState(true)
  const [verwerkBezig, setVerwerkBezig] = useState<string | null>(null)
  const [batchBezig, setBatchBezig] = useState(false)
  const [resultaten, setResultaten] = useState<Record<string, VerwerkResultaat>>({})
  const [gekozenBestandId, setGekozenBestandId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    laadBatches()
  }, [])

  async function laadBatches() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) { setLaden(false); return }

    const { data } = await supabase
      .from('upload_batches')
      .select('id, status, totaal_bestanden, verwerkt, gestart_op')
      .eq('bedrijf_id', bedrijf.id)
      .order('gestart_op', { ascending: false })
      .limit(10)

    setBatches((data ?? []) as UploadBatch[])
    setLaden(false)
  }

  async function laadBestanden(batchId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('upload_bestanden')
      .select('id, bestandsnaam, type, classificatie, fout_melding, verwerkt_op')
      .eq('batch_id', batchId)
      .order('bestandsnaam')
    setBestanden((data ?? []) as UploadBestand[])
    setGekozenBatchId(batchId)
    setGekozenBestandId(null)
  }

  function startPolling(batchId: string) {
    stopPolling()
    pollingRef.current = setInterval(async () => {
      const supabase = createClient()
      const [{ data: batch }, { data: files }] = await Promise.all([
        supabase.from('upload_batches').select('status, verwerkt, totaal_bestanden').eq('id', batchId).single(),
        supabase.from('upload_bestanden').select('id, bestandsnaam, type, classificatie, fout_melding, verwerkt_op').eq('batch_id', batchId).order('bestandsnaam'),
      ])
      if (files) setBestanden(files as UploadBestand[])
      if (batch) {
        setBatches((prev) => prev.map((b) => b.id === batchId ? { ...b, ...batch } : b))
        if (batch.status === 'review_pending' || batch.status === 'completed') {
          stopPolling()
          setBatchBezig(false)
        }
      }
    }, 3000)
  }

  function stopPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  async function verwerkAlles(batchId: string) {
    setBatchBezig(true)
    startPolling(batchId)
    await fetch('/api/bulk-verwerk-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: batchId }),
    })
    // stopPolling wordt al gedaan als status 'review_pending' wordt
  }

  function verwerkBestanden(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) =>
      f.type === 'application/pdf' || f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.pdf')
    )
    setRijen(arr.map((f) => ({ naam: f.name, bestand: f, status: 'wacht' })))
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setSlepen(false)
    if (e.dataTransfer.files.length > 0) verwerkBestanden(e.dataTransfer.files)
  }, [])

  async function startUpload() {
    if (rijen.length === 0 || uploading) return
    setUploading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: bedrijf } = await supabase.from('bedrijven').select('id').eq('user_id', user.id).maybeSingle()
    if (!bedrijf) return

    const { data: batch } = await supabase
      .from('upload_batches')
      .insert({ bedrijf_id: bedrijf.id, status: 'uploading', totaal_bestanden: rijen.length, verwerkt: 0 })
      .select('id')
      .single()

    if (!batch) { setUploading(false); return }

    for (let i = 0; i < rijen.length; i++) {
      const rij = rijen[i]
      setRijen((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'bezig' } : r))

      const pad = `${bedrijf.id}/${batch.id}/${Date.now()}-${rij.naam.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const ext = rij.bestand.name.split('.').pop() ?? 'bin'

      const { error: storageError } = await supabase.storage
        .from('inkoopfacturen')
        .upload(pad, rij.bestand, { contentType: rij.bestand.type || 'application/octet-stream' })

      if (storageError) {
        setRijen((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'fout', fout: storageError.message } : r))
        await supabase.from('upload_bestanden').insert({ batch_id: batch.id, bestandsnaam: rij.naam, storage_path: null, type: ext, fout_melding: storageError.message })
        continue
      }

      await supabase.from('upload_bestanden').insert({ batch_id: batch.id, bestandsnaam: rij.naam, storage_path: pad, type: ext })
      setRijen((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'klaar' } : r))
    }

    await supabase.from('upload_batches').update({ status: 'uploaded', verwerkt: rijen.length }).eq('id', batch.id)
    setUploading(false)
    laadBatches()
    laadBestanden(batch.id)
    setRijen([])
  }

  async function verwerkBestand(bestandId: string) {
    setVerwerkBezig(bestandId)
    setGekozenBestandId(bestandId)

    const response = await fetch('/api/bulk-verwerk-bestand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bestand_id: bestandId }),
    })
    const data = await response.json() as VerwerkResultaat

    setResultaten((prev) => ({ ...prev, [bestandId]: { ...data, bestand_id: bestandId } }))
    setVerwerkBezig(null)

    // Update lokale status
    setBestanden((prev) => prev.map((b) =>
      b.id === bestandId ? { ...b, classificatie: data.fout ? 'fout' : data.classificatie, fout_melding: data.fout ?? null, verwerkt_op: new Date().toISOString() } : b
    ))
  }

  const klasseStatus: Record<string, string> = {
    inkoopfactuur: 'bg-green-100 text-green-700',
    overig: 'bg-gray-100 text-gray-600',
    bezig: 'bg-yellow-100 text-yellow-700',
    fout: 'bg-red-100 text-red-700',
  }

  const gekozenResultaat = gekozenBestandId ? resultaten[gekozenBestandId] : null

  if (laden) return <div className="text-gray-500">Laden...</div>

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Inkoopfacturen importeren</h2>
      <p className="text-sm text-gray-500 mb-6">
        Sleep je inkoopfacturen (PDF of foto) hierheen. Klik daarna "Verwerk" om de inhoud uit te lezen.
      </p>

      {/* Dropzone */}
      {rijen.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setSlepen(true) }}
          onDragLeave={() => setSlepen(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            slepen ? 'border-[#f97316] bg-orange-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <p className="text-3xl mb-3">📂</p>
          <p className="text-sm font-medium text-gray-700">Sleep je facturen hierheen</p>
          <p className="text-xs text-gray-400 mt-1">PDF, JPG of PNG — meerdere bestanden tegelijk</p>
          <button className="mt-4 text-sm text-[#f97316] font-medium hover:underline">Of kies bestanden</button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,image/*" className="hidden"
            onChange={(e) => e.target.files && verwerkBestanden(e.target.files)} />
        </div>
      )}

      {/* Upload rijen */}
      {rijen.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">{rijen.length} bestand{rijen.length !== 1 ? 'en' : ''} klaar voor upload</p>
            <div className="flex gap-2">
              {!uploading && <button onClick={() => setRijen([])} className="text-sm text-gray-500 hover:text-gray-700">Wissen</button>}
              <button onClick={startUpload} disabled={uploading}
                className="bg-[#f97316] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-500 disabled:opacity-50">
                {uploading ? 'Bezig...' : 'Uploaden →'}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {rijen.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-800 truncate flex-1">{r.naam}</p>
                <span className={`text-xs ml-2 shrink-0 ${r.status === 'klaar' ? 'text-green-600' : r.status === 'fout' ? 'text-red-600' : r.status === 'bezig' ? 'text-orange-500' : 'text-gray-400'}`}>
                  {r.status === 'klaar' ? '✓' : r.status === 'fout' ? '✗' : r.status === 'bezig' ? '...' : '○'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eerdere batches */}
      {batches.length > 0 && rijen.length === 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Geüploade batches</h3>
          <div className="flex flex-col gap-2">
            {batches.map((b) => (
              <div key={b.id} className={`bg-white border rounded-lg px-4 py-3 transition-colors ${gekozenBatchId === b.id ? 'border-orange-400' : 'border-gray-200'}`}>
                <button className="w-full text-left" onClick={() => laadBestanden(b.id)}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{b.totaal_bestanden} bestand{b.totaal_bestanden !== 1 ? 'en' : ''}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.status === 'review_pending' || b.status === 'completed' ? 'bg-green-100 text-green-700' : b.status === 'processing' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                      {b.status === 'uploaded' ? 'Klaar voor verwerking' : b.status === 'processing' ? 'Bezig...' : b.status === 'review_pending' ? 'Verwerkt' : b.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(b.gestart_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  {b.status === 'processing' && b.totaal_bestanden > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Verwerkt: {b.verwerkt} / {b.totaal_bestanden}</span>
                        <span>{Math.round((b.verwerkt / b.totaal_bestanden) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-[#f97316] h-1.5 rounded-full transition-all" style={{ width: `${(b.verwerkt / b.totaal_bestanden) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </button>
                {b.status === 'uploaded' && gekozenBatchId === b.id && (
                  <button
                    onClick={() => verwerkAlles(b.id)}
                    disabled={batchBezig}
                    className="mt-3 w-full bg-[#1a2e4a] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#223a5e] disabled:opacity-50"
                  >
                    {batchBezig ? 'Bezig met verwerken...' : `▶ Verwerk alle ${b.totaal_bestanden} bestanden`}
                  </button>
                )}
                {(b.status === 'review_pending' || b.status === 'completed') && (
                  <Link
                    href={`/instellingen/bulk-import/${b.id}`}
                    className="mt-3 block text-center bg-[#f97316] text-white text-sm font-semibold py-2 rounded-lg hover:bg-orange-500"
                  >
                    {b.status === 'completed' ? 'Bekijk opgeslagen materialen →' : 'Bekijk resultaten & opslaan →'}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bestandenlijst van gekozen batch */}
      {bestanden.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Links: bestandenlijst */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Bestanden</h3>
            <div className="flex flex-col gap-1">
              {bestanden.map((b) => (
                <div key={b.id}
                  className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 cursor-pointer transition-colors ${gekozenBestandId === b.id ? 'border-orange-400' : 'border-gray-100 hover:border-gray-300'}`}
                  onClick={() => setGekozenBestandId(b.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{b.bestandsnaam}</p>
                    {b.fout_melding && <p className="text-xs text-red-500 truncate">{b.fout_melding}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.classificatie && b.classificatie !== 'bezig' ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${klasseStatus[b.classificatie] ?? 'bg-gray-100 text-gray-600'}`}>
                        {b.classificatie === 'inkoopfactuur' ? '✓ factuur' : b.classificatie}
                      </span>
                    ) : b.classificatie === 'bezig' ? (
                      <span className="text-xs text-yellow-600">verwerken...</span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); verwerkBestand(b.id) }}
                        disabled={verwerkBezig === b.id}
                        className="text-xs bg-[#f97316] text-white px-3 py-1 rounded-lg font-medium hover:bg-orange-500 disabled:opacity-50"
                      >
                        {verwerkBezig === b.id ? '...' : 'Verwerk'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rechts: resultaat */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Resultaat</h3>
            {!gekozenBestandId && (
              <p className="text-sm text-gray-400">Klik op een bestand om het te verwerken of het resultaat te zien.</p>
            )}
            {gekozenBestandId && !resultaten[gekozenBestandId] && !verwerkBezig && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-sm text-gray-500 mb-3">Dit bestand is nog niet verwerkt.</p>
                <button onClick={() => verwerkBestand(gekozenBestandId)}
                  className="bg-[#f97316] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-500">
                  Verwerk nu →
                </button>
              </div>
            )}
            {verwerkBezig === gekozenBestandId && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-sm text-gray-500">Claude leest de factuur uit...</p>
              </div>
            )}
            {gekozenResultaat && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                {gekozenResultaat.fout && (
                  <p className="text-sm text-red-600">Fout: {gekozenResultaat.fout}</p>
                )}
                {gekozenResultaat.classificatie === 'overig' && (
                  <p className="text-sm text-gray-600">Geen inkoopfactuur: {gekozenResultaat.reden}</p>
                )}
                {gekozenResultaat.classificatie === 'inkoopfactuur' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-green-600 font-medium text-sm">✓ Inkoopfactuur</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-0.5"><span className="text-gray-400 text-xs">Leverancier</span><br />{gekozenResultaat.leverancier}</p>
                    <p className="text-sm text-gray-700 mb-3"><span className="text-gray-400 text-xs">Datum</span><br />{gekozenResultaat.factuurdatum ?? '—'}</p>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{gekozenResultaat.regels?.length ?? 0} materiaalregels</p>
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {(gekozenResultaat.regels ?? []).map((r, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-sm text-gray-900">{r.omschrijving}</p>
                          <p className="text-xs text-gray-500">
                            {r.aantal} {r.eenheid} × €{r.prijs_per_eenheid.toFixed(2)}
                            {r.artikelnummer && <span className="ml-2 text-gray-400">art. {r.artikelnummer}</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
