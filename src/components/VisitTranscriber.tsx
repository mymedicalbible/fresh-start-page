import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { extractVisitFieldsFromTranscript, type ExtractedVisitFields } from '../lib/transcriptExtract'
import { downloadTranscriptPdf } from '../lib/transcriptPdf'

type Props = {
  doctorName: string
  visitDate: string
  existingMeds: string[]
  knownDiagnoses: string[]
  onExtracted: (fields: ExtractedVisitFields) => void
}

export function VisitTranscriber ({
  doctorName,
  visitDate,
  existingMeds,
  knownDiagnoses,
  onExtracted,
}: Props) {
  const [_recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedVisitFields | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  async function startRecording () {
    setError(null)
    setTranscript('')
    setExtracted(null)
    setStatus('connecting')

    const { data, error: fnErr } = await supabase.functions.invoke('transcribe-visit', {})
    if (fnErr || !data?.token) {
      setError('Could not connect to transcription service. Check your API key.')
      setStatus('error')
      return
    }

    const token = data.token as string
    const socket = new WebSocket(
      `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`
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
          const input = e.inputBuffer.getChannelData(0)
          const pcm = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768))
          }
          socket.send(pcm.buffer)
        }

        source.connect(processor)
        processor.connect(audioCtx.destination)
        setRecording(true)
        setStatus('recording')
      } catch {
        setError('Microphone access denied.')
        setStatus('error')
        socket.close()
      }
    }

    socket.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data as string)
      if (parsed.message_type === 'FinalTranscript' && parsed.text) {
        setTranscript((prev) => prev + ' ' + parsed.text)
      }
    }

    socket.onerror = () => {
      setError('Transcription connection error.')
      setStatus('error')
      stopAll()
    }

    socket.onclose = () => {
      stopAll()
    }
  }

  function stopAll () {
    processorRef.current?.disconnect()
    audioCtxRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    socketRef.current?.close()
    processorRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
    socketRef.current = null
    setRecording(false)
  }

  async function stopRecording () {
    stopAll()
    setStatus('processing')
    const result = await extractVisitFieldsFromTranscript(transcript, {
      doctorName,
      existingMeds,
      knownDiagnoses,
    })
    if (!result) {
      setError('Could not extract visit information from transcript.')
      setStatus('error')
      return
    }
    setExtracted(result)
    setShowConfirm(true)
    setStatus('done')
  }

  function confirmAndFill () {
    if (!extracted) return
    onExtracted(extracted)
    setShowConfirm(false)
  }

  useEffect(() => {
    return () => { stopAll() }
  }, [])

  return (
    <div style={{ margin: '16px 0', padding: '16px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Visit transcription</div>
        {status === 'recording' && (
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
            Recording
          </span>
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
        <button type="button" className="btn btn-secondary" onClick={stopRecording}>
          Stop & process
        </button>
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
          <div style={{ fontSize: '0.88rem', lineHeight: 1.6, maxHeight: 160, overflowY: 'auto', padding: '10px 12px', background: 'var(--surface-alt, #f9f9f6)', borderRadius: 8, border: '1px solid var(--border)' }}>
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
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Nothing specific was extracted. You can still use the transcript as notes.</p>
              )}
            </div>

            <div style={{ padding: '14px 20px 24px', borderTop: '1.5px solid var(--border)', display: 'flex', gap: 12, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: 50, fontSize: '1rem', fontWeight: 600 }}
                onClick={() => setShowConfirm(false)}
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
}
