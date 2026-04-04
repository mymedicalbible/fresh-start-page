import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type UpcomingAppt = {
  id: string
  doctor: string
  specialty: string | null
  appointment_date: string
  appointment_time: string | null
}

export function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [open, setOpen] = useState<Record<string, boolean>>({ doctors: false })

  // Summary state
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  function toggle (section: string) {
    setOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    if (!user) return
    async function load () {
      const today = new Date().toISOString().slice(0, 10)

      // Upcoming appointments
      const { data, error } = await supabase
        .from('appointments')
        .select('id, doctor, specialty, appointment_date, appointment_time, visit_logged')
        .eq('user_id', user!.id)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(8)
      if (error) {
        console.warn('appointments load:', error.message)
        setUpcoming([])
      } else {
        const rows = (data ?? []) as (UpcomingAppt & { visit_logged?: boolean | null })[]
        setUpcoming(rows.filter((r) => r.visit_logged !== true) as UpcomingAppt[])
      }

      // Pending visits count
      const { count } = await supabase
        .from('doctor_visits')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('status', 'pending')
      setPendingCount(count ?? 0)
    }
    load()
  }, [user])

  async function generateSummary () {
    if (!user) return
    setSummaryLoading(true)
    setSummaryError(null)
    setSummary(null)

    try {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const sinceStr = since.toISOString().slice(0, 10)

      const [p, m] = await Promise.all([
        supabase.from('pain_entries')
          .select('entry_date, entry_time, location, intensity, pain_type, notes')
          .eq('user_id', user.id)
          .gte('entry_date', sinceStr)
          .order('entry_date', { ascending: false })
          .limit(60),
        supabase.from('mcas_episodes')
          .select('episode_date, episode_time, trigger, symptoms, severity, notes')
          .eq('user_id', user.id)
          .gte('episode_date', sinceStr)
          .order('episode_date', { ascending: false })
          .limit(60),
      ])

      const painData = (p.data ?? []) as any[]
      const mcasData = (m.data ?? []) as any[]

      const prompt = `You are a medical summary assistant helping a patient communicate their health history to their doctors. Based on the following health log data from the past 30 days, write a clear, organized summary in 3–5 short paragraphs that the patient could hand to or read to their doctor. Focus on patterns over time, frequency, average severity, most affected areas, and any notable trends. Be factual, concise, and clinical but readable.

PAIN LOG (${painData.length} entries in last 30 days):
${painData.length === 0 ? 'No pain entries recorded.' : painData.map((r: any) =>
  `- ${r.entry_date}${r.entry_time ? ` at ${r.entry_time}` : ''}: ${r.location ?? 'unknown area'}, intensity ${r.intensity ?? '?'}/10${r.pain_type ? `, type: ${r.pain_type}` : ''}${r.notes ? `, notes: ${r.notes}` : ''}`
).join('\n')}

MCAS EPISODES (${mcasData.length} episodes in last 30 days):
${mcasData.length === 0 ? 'No MCAS episodes recorded.' : mcasData.map((r: any) =>
  `- ${r.episode_date}${r.episode_time ? ` at ${r.episode_time}` : ''}: trigger: ${r.trigger}, symptoms: ${r.symptoms}, severity: ${r.severity ?? 'unknown'}${r.notes ? `, notes: ${r.notes}` : ''}`
).join('\n')}

Write the summary now. Do not include any preamble or sign-off — just the paragraphs.`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const result = await response.json()
      const text = result?.content?.find((c: any) => c.type === 'text')?.text
      if (!text) throw new Error('No summary returned.')
      setSummary(text)
    } catch (e: any) {
      setSummaryError(e?.message ?? 'Failed to generate summary.')
    } finally {
      setSummaryLoading(false)
    }
  }

  if (!user) return <div>Loading...</div>

  return (
    <div style={{ display: 'grid', gap: 12, padding: '8px 0 40px' }}>

      {/* UPCOMING APPOINTMENTS */}
      {upcoming.length > 0 && (
        <div className="banner info">
          <strong>📅 Upcoming appointments</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {upcoming.map((u) => (
              <li key={u.id} className="muted">
                {u.appointment_date}
                {u.appointment_time ? ` · ${u.appointment_time}` : ''}
                {` · ${u.doctor}`}
                {u.specialty ? ` (${u.specialty})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PENDING VISITS BADGE */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => navigate('/app/visits?tab=pending')}
          style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: 12,
            padding: '10px 16px',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <span style={{ fontWeight: 600, color: '#92400e' }}>
            📋 {pendingCount} pending visit{pendingCount !== 1 ? 's' : ''} — finish them
          </span>
          <span style={{ fontSize: '0.85rem', color: '#b45309' }}>Tap to open →</span>
        </button>
      )}

      {/* QUICK LOG BUTTONS */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em' }}>QUICK LOG</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <Link to="/app/log?tab=pain" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            🩹 Pain
          </Link>
          <Link to="/app/log?tab=mcas" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            🔬 MCAS
          </Link>
          <Link to="/app/visits?new=1" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            🏥 Visit
          </Link>
          <Link to="/app/questions" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            ❓ Q's
          </Link>
        </div>
      </div>

      {/* GENERATE SUMMARY */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>📊 Health Summary</div>
            <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
              AI summary of your last 30 days — pain & MCAS
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={generateSummary}
            disabled={summaryLoading}
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {summaryLoading ? 'Generating…' : 'Generate Summary'}
          </button>
        </div>

        {summaryError && (
          <div className="banner error" style={{ marginTop: 12 }}>{summaryError}</div>
        )}

        {summary && (
          <div style={{
            marginTop: 14,
            background: '#f8f9ff',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            fontSize: '0.9rem',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            color: '#2a2540',
          }}>
            {summary}
          </div>
        )}
      </div>

      {/* DOCTORS & DIAGNOSES - Collapsible */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => toggle('doctors')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>
          <span>👩‍⚕️ Doctors & diagnoses</span>
          <span>{open.doctors ? '▲' : '▼'}</span>
        </button>
        {open.doctors && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/doctors" className="btn btn-primary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>👩‍⚕️ My doctors — profiles & history</Link>
            <Link to="/app/visits" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🏥 Doctor visits</Link>
            <Link to="/app/diagnoses" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📋 Diagnoses directory</Link>
            <Link to="/app/questions" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>❓ Questions</Link>
            <Link to="/app/tests" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🧪 Tests & orders</Link>
          </div>
        )}
      </div>

      {/* MEDICATIONS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Link to="/app/meds"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', textDecoration: 'none', color: 'inherit', fontWeight: 700, fontSize: '1rem' }}>
          <span>💊 Medications</span>
          <span>→</span>
        </Link>
      </div>

      {/* CHARTS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Link to="/app/analytics"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', textDecoration: 'none', color: 'inherit', fontWeight: 700, fontSize: '1rem' }}>
          <span>📈 Charts & trends</span>
          <span>→</span>
        </Link>
      </div>

    </div>
  )
}