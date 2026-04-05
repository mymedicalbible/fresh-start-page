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

    setSummary({
      generatedAt: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      painCount: painRows.length,
      painAvgIntensity: painAvg,
      painTopAreas: areaTop,
      painTopTypes: typeTop,
      symptomCount: sympRows.length,
      topSymptoms: symptomTop,
      severityCounts,
      medCount: (medRes.data ?? []).length,
      pendingTests: (testRes.data ?? []).length,
      openQuestions: (qRes.data ?? []).length,
      recentVisitCount: visitRows.length,
      lastVisitDate: visitRows[0]?.visit_date ?? null,
      lastVisitDoctor: visitRows[0]?.doctor ?? null,
    })
    setSummaryLoading(false)
  }

  if (!user) return <div>Loading...</div>

  const severityOrder = ['Severe', 'Moderate', 'Mild', 'Unknown']

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
              Generated {summary.generatedAt} · last 30 days unless noted
            </div>

            {/* PAIN */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>🩹 Pain</div>
              {summary.painCount === 0 ? (
                <div className="muted" style={{ fontSize: '0.85rem' }}>No pain entries in the last 30 days.</div>
              ) : (
                <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{summary.painCount}</span> entries logged
                    {summary.painAvgIntensity !== null && (
                      <> · avg intensity <span style={{ fontWeight: 600 }}>{summary.painAvgIntensity}/10</span></>
                    )}
                  </div>
                  {summary.painTopAreas.length > 0 && (
                    <div className="muted">
                      Areas: {summary.painTopAreas.map((a) => `${a.area} (${a.n}×)`).join(', ')}
                    </div>
                  )}
                  {summary.painTopTypes.length > 0 && (
                    <div className="muted">
                      Types: {summary.painTopTypes.map((t) => t.type).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SYMPTOMS */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>🩺 Symptoms</div>
              {summary.symptomCount === 0 ? (
                <div className="muted" style={{ fontSize: '0.85rem' }}>No symptom episodes in the last 30 days.</div>
              ) : (
                <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                  <div><span style={{ fontWeight: 600 }}>{summary.symptomCount}</span> episodes logged</div>
                  {summary.topSymptoms.length > 0 && (
                    <div className="muted">
                      Most frequent: {summary.topSymptoms.map((s) => `${s.symptom} (${s.n}×)`).join(', ')}
                    </div>
                  )}
                  {Object.keys(summary.severityCounts).length > 0 && (
                    <div className="muted">
                      Severity: {severityOrder
                        .filter((s) => summary.severityCounts[s])
                        .map((s) => `${s} ×${summary.severityCounts[s]}`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* VISITS */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>🏥 Doctor visits <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>(90 days)</span></div>
              {summary.recentVisitCount === 0 ? (
                <div className="muted" style={{ fontSize: '0.85rem' }}>No visits logged in the last 90 days.</div>
              ) : (
                <div style={{ fontSize: '0.85rem', display: 'grid', gap: 2 }}>
                  <div><span style={{ fontWeight: 600 }}>{summary.recentVisitCount}</span> visit{summary.recentVisitCount !== 1 ? 's' : ''} logged</div>
                  {summary.lastVisitDate && (
                    <div className="muted">
                      Most recent: {summary.lastVisitDate}{summary.lastVisitDoctor ? ` · ${summary.lastVisitDoctor}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* MEDICATIONS */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>💊 Medications</div>
              <div style={{ fontSize: '0.85rem' }}>
                {summary.medCount === 0
                  ? <span className="muted">No medications on file.</span>
                  : <><span style={{ fontWeight: 600 }}>{summary.medCount}</span> medication{summary.medCount !== 1 ? 's' : ''} on file</>
                }
                <Link to="/app/meds" className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>→ view</Link>
              </div>
            </div>

            {/* TESTS */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>🧪 Pending tests</div>
              <div style={{ fontSize: '0.85rem' }}>
                {summary.pendingTests === 0
                  ? <span className="muted">No pending tests.</span>
                  : <><span style={{ fontWeight: 600 }}>{summary.pendingTests}</span> test{summary.pendingTests !== 1 ? 's' : ''} awaiting results</>
                }
                {summary.pendingTests > 0 && (
                  <Link to="/app/tests" className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>→ view</Link>
                )}
              </div>
            </div>

            {/* QUESTIONS */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>❓ Open questions</div>
              <div style={{ fontSize: '0.85rem' }}>
                {summary.openQuestions === 0
                  ? <span className="muted">No unanswered questions.</span>
                  : <><span style={{ fontWeight: 600 }}>{summary.openQuestions}</span> question{summary.openQuestions !== 1 ? 's' : ''} waiting for a doctor's answer</>
                }
                {summary.openQuestions > 0 && (
                  <Link to="/app/questions" className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>→ view</Link>
                )}
              </div>
            </div>

            <Link to="/app/analytics" className="btn btn-secondary btn-block"
              style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.85rem', marginTop: 4 }}>
              📈 Full charts & trends →
            </Link>
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
