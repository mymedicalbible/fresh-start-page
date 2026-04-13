import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { SoloTranscriber } from '../components/SoloTranscriber'

function localISODate (d: Date = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function SoloRecordingPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [anchorDate] = useState(() => localISODate())
  const [existingMeds, setExistingMeds] = useState<string[]>([])
  const [knownDiagnoses, setKnownDiagnoses] = useState<string[]>([])
  const [knownDoctors, setKnownDoctors] = useState<string[]>([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      const [medRes, diagRes, docRes] = await Promise.all([
        supabase.from('current_medications').select('medication').eq('user_id', user.id).order('medication'),
        supabase
          .from('diagnoses_directory')
          .select('diagnosis, status')
          .eq('user_id', user.id)
          .order('date_diagnosed', { ascending: false })
          .limit(50),
        supabase.from('doctors').select('name').eq('user_id', user.id).order('name'),
      ])
      if (cancelled) return
      setExistingMeds(
        (medRes.data ?? []).map((r) => String((r as { medication?: string }).medication ?? '').trim()).filter(Boolean),
      )
      setKnownDiagnoses(
        (diagRes.data ?? []).map((r) => {
          const row = r as { diagnosis?: string | null; status?: string | null }
          const d = String(row.diagnosis ?? '').trim()
          const s = String(row.status ?? '').trim()
          if (!d) return ''
          return s ? `${d} (${s})` : d
        }).filter(Boolean),
      )
      setKnownDoctors(
        (docRes.data ?? []).map((r) => String((r as { name?: string }).name ?? '').trim()).filter(Boolean),
      )
    })()
    return () => { cancelled = true }
  }, [user?.id])

  return (
    <div className="scrapbook-inner scrap-more-page" style={{ paddingBottom: 40 }}>
      <BackButton fallbackTo="/app/more" />
      <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Solo voice update</h2>
        <p className="muted" style={{ fontSize: '0.92rem', lineHeight: 1.55, marginBottom: 8 }}>
          Record a voice note about your health. We transcribe it and update or add doctors you name, plus questions,
          medications, your diagnosis directory, and tests — without creating a visit log.
        </p>
        <SoloTranscriber
          anchorDateIso={anchorDate}
          existingMeds={existingMeds}
          knownDiagnoses={knownDiagnoses}
          knownDoctors={knownDoctors}
          onApplied={() => navigate('/app')}
        />
      </div>
    </div>
  )
}
