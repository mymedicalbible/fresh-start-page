import { splitNotesAndRawTranscriptAppendix } from '../lib/transcriptVisitFormat'

type Props = { notes: string | null }

/**
 * Renders visit notes with the raw transcript (if stored) in a collapsed section so the log shows the organized clinical text first.
 */
export function VisitNotesWithTranscriptFold ({ notes }: Props) {
  const { clinical, rawTranscript } = splitNotesAndRawTranscriptAppendix(notes)
  if (!clinical && !rawTranscript) return null

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {clinical && (
        <div className="muted" style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text, #1e293b)' }}>Notes: </span>
          {clinical}
        </div>
      )}
      {rawTranscript && (
        <details>
          <summary className="muted" style={{ fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
            Full transcript (reference)
          </summary>
          <div
            className="muted"
            style={{
              fontSize: '0.82rem',
              whiteSpace: 'pre-wrap',
              marginTop: 6,
              padding: '8px 10px',
              background: 'var(--surface-alt, #f8fafc)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              maxHeight: 280,
              overflowY: 'auto',
              lineHeight: 1.45,
            }}
          >
            {rawTranscript}
          </div>
        </details>
      )}
    </div>
  )
}
