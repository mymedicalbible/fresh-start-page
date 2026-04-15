import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  extractSoloUpdateFieldsFromTranscript,
  type ExtractedSoloFields,
} from '../lib/soloTranscriptExtract'
import { formatSoloExtractSummary } from '../lib/soloTranscriptFormat'
import { applySoloExtractToDatabase } from '../lib/applySoloTranscriptExtract'
import { pushTranscriptArchive } from '../lib/transcriptArchive'
import { downloadTranscriptPdf } from '../lib/transcriptPdf'
import { diagnosisStatusLabel } from '../lib/diagnosisStatusOptions'
import { AppConfirmDialog } from './AppConfirmDialog'
import { useAuth } from '../contexts/AuthContext'

type Props = {
  anchorDateIso: string
  existingMeds: string[]
  knownDiagnoses: string[]
  knownDoctors: string[]
  onApplied?: () => void
}

export type SoloTranscriberHandle = {
  tryCloseParent: (done: () => void) => void
}

const SOLO_PDF_LABEL = 'Solo voice update'

export const SoloTranscriber = forwardRef<SoloTranscriberHandle, Props>(function SoloTranscriber ({
  anchorDateIso,
  existingMeds,
  knownDiagnoses,
  knownDoctors,
  onApplied,
}, ref) {
  const { user } = useAuth()
  const [_recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedSoloFields | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const [archiveAfter, setArchiveAfter] = useState<(() => void) | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recordingPausedRef = useRef(false)
  const [recordingPaused, setRecordingPaused] = useState(false)

  function pushArchiveIfNeeded (save: boolean) {
    if (!save || !transcript.trim()) return
    const ext = extracted
    pushTranscriptArchive({
      kind: 'solo',
      doctorName: SOLO_PDF_LABEL,
      visitDate: anchorDateIso,
      transcript: transcript.trim(),
      extractedSolo: ext,
      extractedSummary: ext ? formatSoloExtractSummary(ext) : undefined,
    }, user?.id)
  }

  function finishArchiveChoice (save: boolean) {
    pushArchiveIfNeeded(save)
    const next = archiveAfter
    setArchiveAfter(null)
    next?.()
  }

  function promptArchiveThen (after: () => void) {
    if (!transcript.trim()) {
      after()
      return
    }
    setArchiveAfter(() => after)
  }

  useImperativeHandle(ref, () => ({
    tryCloseParent (done: () => void) {
      promptArchiveThen(done)
    },
  }), [transcript, anchorDateIso, extracted])

  function togglePause () {
    const next = !recordingPausedRef.current
    recordingPausedRef.current = next
    setRecordingPaused(next)
  }

  async function startRecording () {
    setError(null)
    setTranscript('')
    setExtracted(null)
    setStatus('connecting')

    const { data, error: fnErr } = await supabase.functions.invoke('transcribe-visit', {})
    if (fnErr) {
      let shown = fnErr.message || 'Could not reach transcription service.'
      if (fnErr instanceof FunctionsHttpError && fnErr.context instanceof Response) {
        try {
          const ct = fnErr.context.headers.get('Content-Type') ?? ''
          if (ct.includes('application/json')) {
            const body = (await fnErr.context.json()) as { error?: string; message?: string }
            if (typeof body.error === 'string' && body.error.trim()) shown = body.error.trim()
            else if (typeof body.message === 'string' && body.message.trim()) shown = body.message.trim()
          } else {
            const text = (await fnErr.context.text()).trim()
            if (text) shown = text.slice(0, 500)
          }
        } catch { /* keep shown */ }
      }
      setError(shown)
      setStatus('error')
      return
    }
    const payload = data as { token?: string; error?: string; build?: string } | null
    if (payload?.error) {
      const b = payload.build ? ` [${payload.build}]` : ''
      setError(`${payload.error}${b}`)
      setStatus('error')
      return
    }
    if (!payload?.token) {
      setError('No transcription token returned.')
      setStatus('error')
      return
    }

    const token = payload.token
    const wsParams = new URLSearchParams({
      sample_rate: '16000',
      speech_model: 'u3-rt-pro',
      format_turns: 'true',
      token,
    })
    const socket = new WebSocket(
      `wss://streaming.assemblyai.com/v3/ws?${wsParams.toString()}`,
    )
    socketRef.current = socket

    socket.onopen = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = audioCtx
        const source = audioCtx.createMediaStreamSource(stream)
        const processor = audioCtx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          if (socket.readyState !== WebSocket.OPEN) return
          if (recordingPausedRef.current) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768))
          }
          socket.send(pcm.buffer)
        }

        source.connect(processor)
        processor.connect(audioCtx.destination)
        recordingPausedRef.current = false
        setRecordingPaused(false)
        setRecording(true)
        setStatus('recording')
      } catch {
        setError('Microphone access denied.')
        setStatus('error')
        stopAll()
      }
    }

    socket.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as {
          type?: string
          message_type?: string
          text?: string
          transcript?: string
          end_of_turn?: boolean
        }
        if (parsed.type === 'Turn' && parsed.end_of_turn && parsed.transcript?.trim()) {
          setTranscript((prev) =>
            (prev ? `${prev} ${parsed.transcript}` : parsed.transcript!).trim(),
          )
          return
        }
        if (parsed.message_type === 'FinalTranscript' && parsed.text) {
          setTranscript((prev) => prev + ' ' + parsed.text)
        }
      } catch { /* ignore malformed frames */ }
    }

    socket.onerror = () => {
      setError('Transcription connection error.')
      setStatus('error')
      stopAll()
    }

    socket.onclose = () => {
      socketRef.current = null
      stopMediaTracks()
      setRecording(false)
    }
  }

  function stopMediaTracks () {
    processorRef.current?.disconnect()
    audioCtxRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    processorRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
  }

  function stopAll () {
    recordingPausedRef.current = false
    setRecordingPaused(false)
    const ws = socketRef.current
    socketRef.current = null
    stopMediaTracks()
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'Terminate' }))
      } catch { /* ignore */ }
    }
    ws?.close()
    setRecording(false)
  }

  async function stopRecording () {
    stopAll()
    setStatus('processing')
    const result = await extractSoloUpdateFieldsFromTranscript(transcript, {
      existingMeds,
      knownDiagnoses,
      knownDoctors,
      anchorDateIso,
    })
    if (!result.ok) {
      setError(result.message)
      setStatus('error')
      return
    }
    setExtracted(result.fields)
    setShowConfirm(true)
    setStatus('done')
  }

  async function confirmAndApply () {
    if (!extracted) return
    if (!user?.id) {
      setError('You must be signed in to save.')
      return
    }
    setApplyBusy(true)
    setError(null)
    const res = await applySoloExtractToDatabase(supabase, user.id, extracted, { anchorDateIso })
    setApplyBusy(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    promptArchiveThen(() => {
      setShowConfirm(false)
      onApplied?.()
    })
  }

  function cancelConfirmSheet () {
    promptArchiveThen(() => setShowConfirm(false))
  }

  useEffect(() => {
    return () => { stopAll() }
  }, [])

  const TX = { fontSize: '0.88rem' as const, lineHeight: 1.45 as const }

  const hasAnyExtract =
    !!(extracted?.narrative_summary?.trim()
      || (extracted?.doctors_mentioned ?? []).some((d) => d.name?.trim())
      || (extracted?.questions ?? []).some((q) => q.question?.trim())
      || (extracted?.medications ?? []).some((m) => m.medication?.trim())
      || (extracted?.diagnoses ?? []).some((d) => d.diagnosis?.trim())
      || (extracted?.tests ?? []).some((t) => t.test_name?.trim()))

  return (
    <div style={{ margin: '16px 0', padding: '16px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12 }}>
      {archiveAfter && (
        <AppConfirmDialog
          title="Save transcript?"
          message="Save a copy under Archives → Transcripts? This device only."
          confirmLabel="Save copy"
          cancelLabel="Don't save"
          onConfirm={() => finishArchiveChoice(true)}
          onCancel={() => finishArchiveChoice(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Solo voice update</div>
        {status === 'recording' && !recordingPaused && (
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
            Recording
          </span>
        )}
        {status === 'recording' && recordingPaused && (
          <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>Paused</span>
        )}
        {status === 'connecting' && <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Connecting…</span>}
        {status === 'processing' && <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Processing…</span>}
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Speak freely about your situation, meds, conditions, tests, and doctors you see.
        This updates your doctor list (new names are added or matched to existing profiles), questions, medications, diagnosis directory, and tests — it does not create a visit log.
      </p>

      {error && (
        <div className="banner error" style={{ marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>
      )}

      {status === 'idle' && (
        <button type="button" className="btn btn-primary" onClick={startRecording}>
          Start recording
        </button>
      )}

      {status === 'recording' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={togglePause}>
            {recordingPaused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={stopRecording}>
            Stop &amp; process
          </button>
        </div>
      )}

      {status === 'connecting' && (
        <button type="button" className="btn btn-secondary" disabled>Connecting…</button>
      )}

      {status === 'processing' && (
        <button type="button" className="btn btn-secondary" disabled>Processing transcript…</button>
      )}

      {transcript && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: 6 }}>Live transcript</div>
          <div style={{ ...TX, maxHeight: 160, overflowY: 'auto', padding: '10px 12px', background: 'var(--surface-alt, #f9f9f6)', borderRadius: 8, border: '1px solid var(--border)' }}>
            {transcript}
          </div>
          {status === 'done' && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', marginTop: 8 }}
              onClick={() => downloadTranscriptPdf(transcript, SOLO_PDF_LABEL, anchorDateIso)}
            >
              Download transcript PDF
            </button>
          )}
        </div>
      )}

      {showConfirm && extracted && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(30,77,52,0.18)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: '20px 20px 0 0',
            border: '1.5px solid var(--border)',
            borderBottom: 'none',
            width: '100%',
            maxWidth: 720,
            maxHeight: '85dvh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 -8px 40px rgba(30,77,52,0.14)',
          }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1.5px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Review updates</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginTop: 4 }}>
                Saved to your record: doctors (create or update profiles), questions, meds, diagnoses, tests
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {extracted.narrative_summary?.trim() && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: 10,
                  background: 'var(--surface-alt, #f9f9f6)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Summary
                  </div>
                  <div style={{ fontSize: '0.9rem' }}>{extracted.narrative_summary.trim()}</div>
                </div>
              )}
              {(extracted.doctors_mentioned ?? []).filter((d) => d.name?.trim()).map((d, i) => (
                <div
                  key={`doc-${i}`}
                  style={{
                    padding: '10px 14px',
                    marginBottom: 10,
                    background: 'var(--surface-alt, #f9f9f6)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Doctor profile
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{d.name.trim()}</div>
                  {d.specialty?.trim() && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: 2 }}>{d.specialty.trim()}</div>
                  )}
                  {d.profile_note?.trim() && (
                    <div style={{ fontSize: '0.85rem', marginTop: 6, lineHeight: 1.45 }}>{d.profile_note.trim()}</div>
                  )}
                </div>
              ))}
              {(extracted.questions ?? []).filter((q) => q.question?.trim()).map((q, i) => (
                <div
                  key={`q-${i}`}
                  style={{
                    padding: '10px 14px',
                    marginBottom: 10,
                    background: 'var(--surface-alt, #f9f9f6)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Question → {q.doctor.trim() || 'Your care team'}
                  </div>
                  <div style={{ fontSize: '0.9rem' }}>{q.question.trim()}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginTop: 4 }}>Priority: {q.priority}</div>
                </div>
              ))}
              {(extracted.medications ?? []).filter((m) => m.medication?.trim()).map((m, i) => (
                <div
                  key={`m-${i}`}
                  style={{
                    padding: '10px 14px',
                    marginBottom: 10,
                    background: 'var(--surface-alt, #f9f9f6)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Medication ({m.change})
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{m.medication.trim()}</div>
                  {(m.dose?.trim() || m.frequency?.trim()) && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: 2 }}>
                      {[m.dose?.trim(), m.frequency?.trim()].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
              {(extracted.diagnoses ?? []).filter((d) => d.diagnosis?.trim()).map((d, i) => (
                <div
                  key={`diag-${i}`}
                  style={{
                    padding: '10px 14px',
                    marginBottom: 10,
                    background: 'var(--surface-alt, #f9f9f6)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Diagnosis directory
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{d.diagnosis.trim()}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: 2 }}>{diagnosisStatusLabel(d.status)}</div>
                </div>
              ))}
              {(extracted.tests ?? []).filter((t) => t.test_name?.trim()).map((t, i) => (
                <div
                  key={`t-${i}`}
                  style={{
                    padding: '10px 14px',
                    marginBottom: 10,
                    background: 'var(--surface-alt, #f9f9f6)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Test
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t.test_name.trim()}</div>
                  {t.doctor_name?.trim() && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginTop: 2 }}>Ordering / related: {t.doctor_name.trim()}</div>
                  )}
                  {t.reason?.trim() && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: 2 }}>{t.reason.trim()}</div>
                  )}
                </div>
              ))}
              {!hasAnyExtract && (
                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.88rem' }}>No structured updates were extracted. You can try recording again with more detail.</p>
              )}
            </div>

            <div style={{ padding: '14px 20px 24px', borderTop: '1.5px solid var(--border)', display: 'flex', gap: 12, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: 50, fontSize: '1rem', fontWeight: 600 }}
                disabled={applyBusy}
                onClick={cancelConfirmSheet}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 50, fontSize: '1rem', fontWeight: 600 }}
                disabled={applyBusy || !hasAnyExtract}
                onClick={() => void confirmAndApply()}
              >
                {applyBusy ? 'Saving…' : 'Update my record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
