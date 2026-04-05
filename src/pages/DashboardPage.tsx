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

type HealthSummary = {
  generatedAt: string
  aiText: string | null
  // Pain
  painCount: number
  painAvgIntensity: number | null
  painTopAreas: { area: string; n: number }[]
  painTopTypes: { type: string; n: number }[]
  // Symptoms
  symptomCount: number
  topSymptoms: { symptom: string; n: number }[]
  severityCounts: Record<string, number>
  // Meds
  medCount: number
  // Tests
  pendingTests: number
  // Questions
  openQuestions: number
  // Visits
  recentVisitCount: number
  lastVisitDate: string | null
  lastVisitDoctor: string | null
}

function parseList (text: string | null): string[] {
  if (!text) return []
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function topN<T extends string> (items: T[], n = 5): { value: T; count: number }[] {
  const map = new Map<T, number>()
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1)
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }))
}

export function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState<Record<string, boolean>>({ doctors: false })
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  // Simple 30-day counters shown immediately (no button press needed)
  const [quickStats, setQuickStats] = useState<{ pain: number; symptoms: number; questions: number } | null>(null)

  function toggleDrawer (section: string) {
    setDrawerOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    if (!user) return
    async function load () {
      const today = new Date().toISOString().slice(0, 10)

      // Upcoming appointments
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('id, doctor, specialty, appointment_date, appointment_time, visit_logged')
        .eq('user_id', user!.id)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(8)
      if (apptErr) console.warn('appointments:', apptErr.message)
      else {
        const rows = (apptData ?? []) as (UpcomingAppt & { visit_logged?: boolean | null })[]
        setUpcoming(rows.filter((r) => r.visit_logged !== true) as UpcomingAppt[])
      }

      // Pending visits
      try {
        const { count } = await supabase
          .from('doctor_visits')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('status', 'pending')
        setPendingCount(count ?? 0)
      } catch { setPendingCount(0) }

      // Quick 30-day counts
      const since30 = new Date()
      since30.setDate(since30.getDate() - 30)
      const since30Str = since30.toISOString().slice(0, 10)

      const [painC, sympC, qC] = await Promise.all([
        supabase.from('pain_entries').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).gte('entry_date', since30Str),
        supabase.from('mcas_episodes').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).gte('episode_date', since30Str),
        supabase.from('doctor_questions').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).eq('status', 'Unanswered'),
      ])
      setQuickStats({
        pain: painC.count ?? 0,
        symptoms: sympC.count ?? 0,
        questions: qC.count ?? 0,
      })
    }
    load()
  }, [user])

  async function generateSummary () {
    if (!user) return
    setSummaryLoading(true)
    setSummary(null)

    const since30 = new Date()
    since30.setDate(since30.getDate() - 30)
    const since30Str = since30.toISOString().slice(0, 10)

    const since90 = new Date()
    since90.setDate(since90.getDate() - 90)
    const since90Str = since90.toISOString().slice(0, 10)

    const [painRes, sympRes, medRes, testRes, qRes, visitRes] = await Promise.all([
      supabase.from('pain_entries')
        .select('entry_date, intensity, location, pain_type')
        .eq('user_id', user.id)
        .gte('entry_date', since30Str)
        .order('entry_date', { ascending: false })
        .limit(200),
      supabase.from('mcas_episodes')
        .select('episode_date, symptoms, severity')
        .eq('user_id', user.id)
        .gte('episode_date', since30Str)
        .order('episode_date', { ascending: false })
        .limit(200),
      supabase.from('current_medications')
        .select('medication, dose, frequency')
        .eq('user_id', user.id),
      supabase.from('tests_ordered')
        .select('test_name, status')
        .eq('user_id', user.id)
        .eq('status', 'Pending'),
      supabase.from('doctor_questions')
        .select('question, priority')
        .eq('user_id', user.id)
        .eq('status', 'Unanswered'),
      supabase.from('doctor_visits')
        .select('visit_date, doctor')
        .eq('user_id', user.id)
        .gte('visit_date', since90Str)
        .order('visit_date', { ascending: false })
        .limit(50),
    ])

    const painRows = (painRes.data ?? []) as any[]
    const sympRows = (sympRes.data ?? []) as any[]

    // Pain stats
    const intensities = painRows.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
    const painAvg = intensities.length > 0
      ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
      : null

    const allAreas = painRows.flatMap((r) => parseList(r.location))
    const areaTop = topN(allAreas).map(({ value, count }) => ({ area: value, n: count }))

    const allTypes = painRows.flatMap((r) => parseList(r.pain_type))
    const typeTop = topN(allTypes).map(({ value, count }) => ({ type: value, n: count }))

    // Symptom stats
    const allSymptoms = sympRows.flatMap((r) => parseList(r.symptoms))
    const symptomTop = topN(allSymptoms).map(({ value, count }) => ({ symptom: value, n: count }))

    const severityCounts: Record<string, number> = {}
    for (const r of sympRows) {
      const s = r.severity ?? 'Unknown'
      severityCounts[s] = (severityCounts[s] ?? 0) + 1
    }

    // Visits
    const visitRows = (visitRes.data ?? []) as any[]

    // Build prompt for Claude
    const medList = (medRes.data ?? []) as any[]
    const testList = (testRes.data ?? []) as any[]
    const qList = (qRes.data ?? []) as any[]

    const prompt = [
      'You are a compassionate health assistant helping a patient with complex chronic illness understand their health patterns.',
      'Write a brief, warm, plain-English health summary (4–6 short paragraphs, no bullet lists, no markdown headers) based on this data from the last 30 days (visits: 90 days):',
      '',
      `PAIN (last 30 days): ${painRows.length} entries logged.${painAvg !== null ? ` Average intensity: ${painAvg}/10.` : ''}${areaTop.length ? ` Most affected areas: ${areaTop.map((a) => a.area).join(', ')}.` : ''}${typeTop.length ? ` Pain types: ${typeTop.map((t) => t.type).join(', ')}.` : ''}`,
      '',
      `SYMPTOMS (last 30 days): ${sympRows.length} episodes.${symptomTop.length ? ` Most frequent: ${symptomTop.slice(0, 4).map((s) => `${s.symptom} (${s.n}×)`).join(', ')}.` : ''}${Object.keys(severityCounts).length ? ` Severity breakdown: ${Object.entries(severityCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}.` : ''}`,
      '',
      `MEDICATIONS: ${medList.length} current medication${medList.length !== 1 ? 's' : ''}${medList.length > 0 ? ': ' + medList.slice(0, 5).map((m: any) => m.medication + (m.dose ? ` ${m.dose}` : '')).join(', ') : ''}.`,
      '',
      `DOCTOR VISITS (last 90 days): ${visitRows.length} visit${visitRows.length !== 1 ? 's' : ''} logged.${visitRows[0] ? ` Most recent: ${visitRows[0].visit_date} with ${visitRows[0].doctor}.` : ''}`,
      '',
      `PENDING TESTS: ${testList.length}${testList.length > 0 ? ' — ' + testList.slice(0, 4).map((t: any) => t.test_name).join(', ') : ''}.`,
      '',
      `OPEN QUESTIONS FOR DOCTORS: ${qList.length}${qList.length > 0 ? ' — e.g. ' + qList.slice(0, 2).map((q: any) => q.question).join('; ') : ''}.`,
      '',
      'Focus on patterns, what stands out, and any gentle encouragement. Keep it under 200 words. Do not diagnose or give medical advice.',
    ].join('\n')

    let aiText: string | null = null
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate-summary', {
        body: { prompt },
      })
      if (fnErr) throw fnErr
      aiText = (fnData as any)?.summary ?? null
    } catch (aiErr) {
      console.warn('Claude summary failed, falling back to stats:', aiErr)
    }

    setSummary({
      generatedAt: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      aiText,
      painCount: painRows.length,
      painAvgIntensity: painAvg,
      painTopAreas: areaTop,
      painTopTypes: typeTop,
      symptomCount: sympRows.length,
      topSymptoms: symptomTop,
      severityCounts,
      medCount: medList.length,
      pendingTests: testList.length,
      openQuestions: qList.length,
      recentVisitCount: visitRows.length,
      lastVisitDate: visitRows[0]?.visit_date ?? null,
      lastVisitDoctor: visitRows[0]?.doctor ?? null,
    })
    setSummaryLoading(false)
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

      {/* PENDING VISITS NUDGE */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => navigate('/app/visits?tab=pending')}
          style={{
            background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 12,
            padding: '10px 16px', cursor: 'pointer', textAlign: 'left',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          }}
        >
          <span style={{ fontWeight: 600, color: '#92400e' }}>
            📋 {pendingCount} pending visit{pendingCount !== 1 ? 's' : ''} — finish them
          </span>
          <span style={{ fontSize: '0.85rem', color: '#b45309' }}>Tap to open →</span>
        </button>
      )}

      {/* QUICK LOG */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.04em' }}>QUICK LOG</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <Link to="/app/log?tab=pain" className="btn btn-secondary"
            style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            🩹 Pain
          </Link>
          <Link to="/app/log?tab=symptoms" className="btn btn-secondary"
            style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            🩺 Symptoms
          </Link>
          <Link to="/app/visits?new=1" className="btn btn-primary"
            style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            🏥 Visit
          </Link>
          <Link to="/app/questions" className="btn btn-secondary"
            style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>
            ❓ Q's
          </Link>
        </div>
      </div>

      {/* QUICK STATS — always visible */}
      {quickStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Link to="/app/records?tab=pain" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#fef3c7', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#92400e' }}>{quickStats.pain}</div>
              <div style={{ fontSize: '0.7rem', color: '#78350f', marginTop: 2 }}>Pain (30d)</div>
            </div>
          </Link>
          <Link to="/app/records?tab=symptoms" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#ede9fe', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#5b21b6' }}>{quickStats.symptoms}</div>
              <div style={{ fontSize: '0.7rem', color: '#4c1d95', marginTop: 2 }}>Symptoms (30d)</div>
            </div>
          </Link>
          <Link to="/app/questions" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#dbeafe', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1e40af' }}>{quickStats.questions}</div>
              <div style={{ fontSize: '0.7rem', color: '#1e3a8a', marginTop: 2 }}>Open Q's</div>
            </div>
          </Link>
        </div>
      )}

      {/* HEALTH SUMMARY CARD */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: summary ? 16 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>📋 Health Summary</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>Pain · symptoms · visits · meds · tests</div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={summary ? () => setSummary(null) : generateSummary}
            disabled={summaryLoading}
            style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {summaryLoading ? 'Loading…' : summary ? 'Close' : 'Generate'}
          </button>
        </div>

        {summary && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="muted" style={{ fontSize: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              Generated {summary.generatedAt} · last 30 days (visits: 90 days)
              {summary.aiText && <span style={{ marginLeft: 8, color: '#6366f1' }}>· AI summary</span>}
            </div>

            {/* AI TEXT — shown when Claude responded */}
            {summary.aiText ? (
              <div style={{ fontSize: '0.92rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', color: '#1f2937' }}>
                {summary.aiText}
              </div>
            ) : (
              /* FALLBACK STATS — shown when Claude is not configured */
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>🩹 Pain</div>
                  {summary.painCount === 0 ? (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>No pain entries in the last 30 days.</div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                      {summary.painCount} entries · avg {summary.painAvgIntensity ?? '—'}/10
                      {summary.painTopAreas.length > 0 && <div className="muted">Areas: {summary.painTopAreas.map((a) => a.area).join(', ')}</div>}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>🩺 Symptoms</div>
                  {summary.symptomCount === 0 ? (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>No episodes in the last 30 days.</div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                      {summary.symptomCount} episodes
                      {summary.topSymptoms.length > 0 && <div className="muted">Most frequent: {summary.topSymptoms.slice(0, 4).map((s) => s.symptom).join(', ')}</div>}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.85rem', display: 'grid', gap: 4 }}>
                  <div>🏥 <strong>{summary.recentVisitCount}</strong> visit{summary.recentVisitCount !== 1 ? 's' : ''} (90d){summary.lastVisitDate ? ` · Last: ${summary.lastVisitDate}` : ''}</div>
                  <div>💊 <strong>{summary.medCount}</strong> medication{summary.medCount !== 1 ? 's' : ''} on file</div>
                  <div>🧪 <strong>{summary.pendingTests}</strong> test{summary.pendingTests !== 1 ? 's' : ''} pending · <strong>{summary.openQuestions}</strong> open question{summary.openQuestions !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}

            {/* QUICK LINKS */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              <Link to="/app/records" className="muted" style={{ fontSize: '0.8rem' }}>→ Pain & symptoms</Link>
              <Link to="/app/visits" className="muted" style={{ fontSize: '0.8rem' }}>→ Visits</Link>
              <Link to="/app/meds" className="muted" style={{ fontSize: '0.8rem' }}>→ Meds</Link>
              <Link to="/app/tests" className="muted" style={{ fontSize: '0.8rem' }}>→ Tests</Link>
              <Link to="/app/analytics" className="muted" style={{ fontSize: '0.8rem' }}>→ Charts</Link>
            </div>
          </div>
        )}
      </div>

      {/* DOCTORS & DIAGNOSES */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => toggleDrawer('doctors')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>
          <span>👩‍⚕️ Doctors & diagnoses</span>
          <span>{drawerOpen.doctors ? '▲' : '▼'}</span>
        </button>
        {drawerOpen.doctors && (
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
        <Link to="/app/meds" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', textDecoration: 'none', color: 'inherit', fontWeight: 700, fontSize: '1rem' }}>
          <span>💊 Medications</span><span>→</span>
        </Link>
      </div>

      {/* CHARTS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Link to="/app/analytics" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', textDecoration: 'none', color: 'inherit', fontWeight: 700, fontSize: '1rem' }}>
          <span>📈 Charts & trends</span><span>→</span>
        </Link>
      </div>

    </div>
  )
}
