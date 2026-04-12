import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { extractVisitFieldsFromTranscript, type ExtractedVisitFields, type TranscriptExtractPayload } from '../lib/transcriptExtract'
import { pushTranscriptArchive } from '../lib/transcriptArchive'
import { formatExtractedClinicalSummary } from '../lib/transcriptVisitFormat'
import { downloadTranscriptPdf } from '../lib/transcriptPdf'
import { AppConfirmDialog } from './AppConfirmDialog'

type Props = {
  doctorName: string
  visitDate: string
  existingMeds: string[]
  knownDiagnoses: string[]
  onExtracted: (payload: TranscriptExtractPayload) => void
}

export type VisitTranscriberHandle = {
  /** Prompt to archive transcript (if any), then run `done` (e.g. close parent modal). */
  tryCloseParent: (done: () => void) => void
}

export const VisitTranscriber = forwardRef<VisitTranscriberHandle, Props>(function VisitTranscriber ({
  doctorName,
  visitDate,
  existingMeds,
  knownDiagnoses,
  onExtracted,
}, ref) {
  const [_recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedVisitFields | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  /** After user chooses save/skip archive (stacked above confirm sheet when needed). */
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
      doctorName: doctorName.trim() || 'Unknown doctor',
      visitDate,
      transcript: transcript.trim(),
      extracted: ext,
      extractedSummary: ext ? formatExtractedClinicalSummary(ext) : undefined,
    })
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
  }), [transcript, doctorName, visitDate, extracted])

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
      `wss://streaming.assemblyai.com/v3/ws?${wsParams.toString()}`
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
    const result = await extractVisitFieldsFromTranscript(transcript, {
      doctorName,
      existingMeds,
      knownDiagnoses,
      visitDateIso: visitDate,
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

  function confirmAndFill () {
    if (!extracted) return
    promptArchiveThen(() => {
      onExtracted({ fields: extracted, transcript })
      setShowConfirm(false)
    })
  }

  function cancelConfirmSheet () {
    promptArchiveThen(() => setShowConfirm(false))
  }

  useEffect(() => {
    return () => { stopAll() }
  }, [])

  const TX = { fontSize: '0.88rem' as const, lineHeight: 1.45 as const }

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
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Visit transcription</div>
        {status === 'recording' && !recordingPaused && (
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
            Recording
          </span>
        )}
        {status === 'recording' && recordingPaused && (
          <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>Paused</span>
        )}
        {status === 'connecting' && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Connecting…</span>}
        {status === 'processing' && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Processing…</span>}
      </div>

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
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 6 }}>Live transcript</div>
          <div style={{ ...TX, maxHeight: 160, overflowY: 'auto', padding: '10px 12px', background: 'var(--surface-alt, #f9f9f6)', borderRadius: 8, border: '1px solid var(--border)' }}>
            {transcript}
          </div>
          {status === 'done' && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', marginTop: 8 }}
              onClick={() => downloadTranscriptPdf(transcript, doctorName, visitDate)}
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
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>What we found</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                Review what will be added to your visit log
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {extracted.reason_for_visit?.trim() && (
                <div style={{
                  padding: '10px 14px',
                  marginBottom: 10,
                  background: 'var(--surface-alt, #f9f9f6)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    → Reason for visit
                  </div>
                  <div style={{ fontSize: '0.9rem' }}>{extracted.reason_for_visit.trim()}</div>
                </div>
              )}
              {extracted.summary.map((item, i) => (
                <div key={i} style={{
                  padding: '10px 14px',
                  marginBottom: 10,
                  background: 'var(--surface-alt, #f9f9f6)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    → {item.destination}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.field}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 2 }}>{item.value}</div>
                </div>
              ))}
              {extracted.summary.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No fields extracted.</p>
              )}
            </div>

            <div style={{ padding: '14px 20px 24px', borderTop: '1.5px solid var(--border)', display: 'flex', gap: 12, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: 50, fontSize: '1rem', fontWeight: 600 }}
                onClick={cancelConfirmSheet}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 50, fontSize: '1rem', fontWeight: 600 }}
                onClick={confirmAndFill}
              >
                Add to visit log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
