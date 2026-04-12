import { useEffect, useState } from 'react'
import { BackButton } from '../components/BackButton'
import { deleteTranscriptArchiveItem, loadTranscriptArchive, type ArchivedTranscript } from '../lib/transcriptArchive'

export function TranscriptsPage () {
  const [transcripts, setTranscripts] = useState<ArchivedTranscript[]>([])
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<string | null>(null)

  useEffect(() => {
    setTranscripts(loadTranscriptArchive())
  }, [])

  function removeArchivedTranscript (id: string) {
    deleteTranscriptArchiveItem(id)
    setTranscripts(loadTranscriptArchive())
    if (expandedTranscriptId === id) setExpandedTranscriptId(null)
  }

  return (
    <div className="scrapbook-inner scrap-more-page" style={{ paddingBottom: 40 }}>
      <BackButton fallbackTo="/app/more" />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Transcript archive</h2>
        {transcripts.length === 0 ? (
          <p className="muted">No transcripts.</p>
        ) : null}
        {transcripts.map((a) => {
          const open = expandedTranscriptId === a.id
          return (
            <div key={a.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: '0.92rem' }}>{new Date(a.savedAtIso).toLocaleString()}</strong>
                  <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    {a.visitDate} · {a.doctorName || 'Doctor not set'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                    onClick={() => setExpandedTranscriptId(open ? null : a.id)}>
                    {open ? 'Collapse' : 'Read'}
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 8px', color: 'var(--danger)' }}
                    onClick={() => removeArchivedTranscript(a.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {open && (
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  {a.extractedSummary?.trim() && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Clinical summary</div>
                      <div
                        style={{
                          padding: '12px 14px',
                          background: 'var(--bg)',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          fontSize: '0.88rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 220,
                          overflowY: 'auto',
                          lineHeight: 1.45,
                        }}
                      >
                        {a.extractedSummary}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Transcript</div>
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'var(--bg)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        fontSize: '0.88rem',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 360,
                        overflowY: 'auto',
                        lineHeight: 1.45,
                      }}
                    >
                      {a.transcript}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
