import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadHealthSummaryPdf } from '../lib/summaryPdf'
import { buildCompactPatientData } from '../lib/summaryContext'
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
  aiError: string | null
  /** Narrative fallback built client-side (for PDF & fallback display) */
  narrativeFallback: string
  // Raw stats kept for the quick-stats row
  painCount: number
  symptomCount: number
  medCount: number
  pendingTests: number
  openQuestions: number
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

type FallbackInput = {
  painRows: Record<string, unknown>[]
  sympRows: Record<string, unknown>[]
  medList: Record<string, unknown>[]
  testRows: Record<string, unknown>[]
  diagRows: Record<string, unknown>[]
  visitRows: Record<string, unknown>[]
  qList: Record<string, unknown>[]
  painAvg: number | null
  painTopAreas: { area: string; n: number }[]
  painTopTypes: { type: string; n: number }[]
  topSymptoms: { symptom: string; n: number }[]
}

function buildNarrativeFallback (d: FallbackInput): string {
  const s: string[] = []
  const hasPain = d.painRows.length > 0
  const hasSymp = d.sympRows.length > 0
  const hasMeds = d.medList.length > 0
  const hasDiag = d.diagRows.length > 0
  const hasVisits = d.visitRows.length > 0
  const pendingTests = d.testRows.filter((t) => t.status === 'Pending')
  const flares = d.painRows.filter((r) => typeof r.intensity === 'number' && (r.intensity as number) >= 7)

  // --- EXECUTIVE SUMMARY (one tight paragraph) ---
  let exec = 'EXECUTIVE SUMMARY\n'
  if (!hasPain && !hasSymp && !hasDiag) {
    exec += 'The patient has begun tracking their health but limited data is recorded so far. More entries will produce a fuller summary.'
  } else {
    const parts: string[] = []
    if (hasPain) {
      let p = `The patient logged ${d.painRows.length} pain entr${d.painRows.length !== 1 ? 'ies' : 'y'}`
      if (d.painAvg != null) p += `, avg intensity ${d.painAvg}/10`
      if (d.painTopAreas.length) p += `, mainly in ${d.painTopAreas.slice(0, 3).map((a) => a.area).join(', ')}`
      if (flares.length) p += `, with ${flares.length} flare${flares.length !== 1 ? 's' : ''} at 7+/10`
      parts.push(p + '.')
    }
    if (hasSymp) {
      let p = `${d.sympRows.length} symptom episode${d.sympRows.length !== 1 ? 's' : ''} recorded`
      if (d.topSymptoms.length) p += ` — most common: ${d.topSymptoms.slice(0, 3).map((x) => x.symptom).join(', ')}`
      parts.push(p + '.')
    }
    if (hasMeds) parts.push(`Currently on ${d.medList.length} medication${d.medList.length !== 1 ? 's' : ''}.`)
    if (pendingTests.length) parts.push(`${pendingTests.length} test${pendingTests.length !== 1 ? 's' : ''} pending.`)
    if (d.qList.length) parts.push(`${d.qList.length} open question${d.qList.length !== 1 ? 's' : ''} for provider.`)
    exec += parts.join(' ')
  }
  s.push(exec)

  // --- KEY ACTIVE ISSUES (compressed lines, not paragraphs) ---
  const issues: string[] = []
  if (hasPain) {
    let line = `Pain: ${d.painRows.length} entries, avg ${d.painAvg ?? '—'}/10`
    if (d.painTopAreas.length) line += ` | areas: ${d.painTopAreas.map((a) => a.area).join(', ')}`
    if (d.painTopTypes.length) line += ` | type: ${d.painTopTypes.map((t) => t.type).join(', ')}`
    if (flares.length) line += ` | ${flares.length} flare${flares.length !== 1 ? 's' : ''} ≥7/10`
    issues.push(line)
  }
  if (hasSymp) {
    let line = `Symptoms: ${d.sympRows.length} episode${d.sympRows.length !== 1 ? 's' : ''}`
    if (d.topSymptoms.length) line += ` | recurring: ${d.topSymptoms.slice(0, 4).map((x) => x.symptom).join(', ')}`
    issues.push(line)
  }
  if (issues.length) s.push('KEY ACTIVE ISSUES\n' + issues.join('\n'))

  // --- CURRENT TREATMENT AND DIAGNOSES (compact block) ---
  const txLines: string[] = []
  if (hasMeds) {
    const medStr = d.medList.map((m) => {
      let t = m.medication as string
      if (m.dose) t += ` ${m.dose}`
      if (m.frequency) t += ` ${m.frequency}`
      return t
    })
    txLines.push('Meds: ' + medStr.join('; '))
  } else {
    txLines.push('Meds: none listed')
  }
  if (hasDiag) {
    const diagStr = d.diagRows.map((dd) => {
      let t = dd.diagnosis as string
      if (dd.status && dd.status !== 'Active') t += ` (${dd.status})`
      return t
    })
    txLines.push('Dx: ' + diagStr.join('; '))
  } else {
    txLines.push('Dx: none recorded')
  }
  s.push('CURRENT TREATMENT AND DIAGNOSES\n' + txLines.join('\n'))

  // --- RECENT MEDICAL EVENTS (max 2 visits, one-liners) ---
  let events = 'RECENT MEDICAL EVENTS\n'
  if (hasVisits) {
    events += d.visitRows.slice(0, 2).map((v) => {
      let line = `${v.visit_date} — ${v.doctor || 'provider'}`
      if (v.specialty) line += ` (${v.specialty})`
      if (v.reason) line += `: ${v.reason}`
      if (v.instructions) line += ` → ${v.instructions}`
      if (v.follow_up) line += ` | f/u: ${v.follow_up}`
      return line
    }).join('\n')
    if (d.visitRows.length > 2) events += `\n(${d.visitRows.length - 2} more visit${d.visitRows.length - 2 !== 1 ? 's' : ''} in app)`
  } else {
    events += 'No visits logged.'
  }
  if (pendingTests.length) {
    events += '\nPending tests: ' + pendingTests.map((t) => t.test_name as string).join(', ')
  }
  const completedTests = d.testRows.filter((t) => t.status !== 'Pending').slice(0, 3)
  if (completedTests.length) {
    events += '\nRecent results: ' + completedTests.map((t) => {
      let line = `${t.test_name} (${t.test_date})`
      if (t.results) line += ` — ${t.results}`
      return line
    }).join('; ')
  }
  s.push(events)

  // --- QUESTIONS FOR NEXT VISIT (max 3) ---
  let qs = 'QUESTIONS FOR NEXT VISIT\n'
  if (d.qList.length > 0) {
    qs += d.qList.slice(0, 3).map((q) => `• ${q.question}`).join('\n')
    if (d.qList.length > 3) qs += `\n(${d.qList.length - 3} more in app)`
  } else {
    qs += 'None flagged.'
  }
  s.push(qs)

  return s.join('\n\n')
}

export function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState<Record<string, boolean>>({ doctors: false })
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryMode, setSummaryMode] = useState<'fast' | 'thorough'>('thorough')
  const [patientFocus, setPatientFocus] = useState('')
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

  useEffect(() => {
    try {
      const s = localStorage.getItem('mb-handoff-focus')
      if (s) setPatientFocus(s)
    } catch { /* ignore */ }
  }, [])

  async function generateSummary () {
    if (!user) return
    setSummaryLoading(true)
    setSummary(null)

    const since90 = new Date()
    since90.setDate(since90.getDate() - 90)
    const since90Str = since90.toISOString().slice(0, 10)

    const [
      painRes, sympRes, medRes, testsRes, pendingTestsRes,
      diagRes, visitRes, qRes, symptomLogRes,
    ] = await Promise.all([
      supabase.from('pain_entries')
        .select('entry_date, entry_time, intensity, location, pain_type, triggers, relief_methods, notes')
        .eq('user_id', user.id)
        .gte('entry_date', since90Str)
        .order('entry_date', { ascending: false })
        .limit(120),
      supabase.from('mcas_episodes')
        .select('episode_date, episode_time, activity, symptoms, severity, relief, notes')
        .eq('user_id', user.id)
        .gte('episode_date', since90Str)
        .order('episode_date', { ascending: false })
        .limit(120),
      supabase.from('current_medications')
        .select('medication, dose, frequency, purpose, notes')
        .eq('user_id', user.id)
        .order('medication', { ascending: true }),
      supabase.from('tests_ordered')
        .select('test_name, status, test_date, doctor, reason, results')
        .eq('user_id', user.id)
        .order('test_date', { ascending: false })
        .limit(40),
      supabase.from('tests_ordered')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'Pending'),
      supabase.from('diagnoses_directory')
        .select('diagnosis, status, doctor, date_diagnosed')
        .eq('user_id', user.id)
        .order('date_diagnosed', { ascending: false })
        .limit(25),
      supabase.from('doctor_visits')
        .select('visit_date, doctor, specialty, reason, findings, tests_ordered, instructions, notes, follow_up')
        .eq('user_id', user.id)
        .gte('visit_date', since90Str)
        .order('visit_date', { ascending: false })
        .limit(15),
      supabase.from('doctor_questions')
        .select('question, priority, date_created, doctor')
        .eq('user_id', user.id)
        .eq('status', 'Unanswered')
        .order('date_created', { ascending: false })
        .limit(25),
      supabase.from('symptom_logs')
        .select('logged_at, activity_last_4h, symptoms')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(18),
    ])

    const painRows = (painRes.data ?? []) as Record<string, unknown>[]
    const sympRows = (sympRes.data ?? []) as Record<string, unknown>[]
    const medList = (medRes.data ?? []) as Record<string, unknown>[]
    const testRows = (testsRes.data ?? []) as Record<string, unknown>[]
    const diagRows = (diagRes.data ?? []) as Record<string, unknown>[]
    const visitRows = (visitRes.data ?? []) as Record<string, unknown>[]
    const qList = (qRes.data ?? []) as Record<string, unknown>[]
    const slogRows = (symptomLogRes.error ? [] : (symptomLogRes.data ?? [])) as { logged_at: string; activity_last_4h: string | null; symptoms: string[] | null }[]

    const pendingTests = pendingTestsRes.count ?? 0

    const intensities = painRows.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
    const painAvg = intensities.length > 0
      ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
      : null

    const allAreas = painRows.flatMap((r) => parseList(r.location as string | null))
    const areaTop = topN(allAreas).map(({ value, count }) => ({ area: value, n: count }))
    const allTypes = painRows.flatMap((r) => parseList(r.pain_type as string | null))
    const typeTop = topN(allTypes).map(({ value, count }) => ({ type: value, n: count }))
    const allSymptoms = sympRows.flatMap((r) => parseList(r.symptoms as string | null))
    const symptomTop = topN(allSymptoms).map(({ value, count }) => ({ symptom: value, n: count }))
    const todayIso = new Date().toISOString().slice(0, 10)
    try {
      localStorage.setItem('mb-handoff-focus', patientFocus)
    } catch { /* ignore */ }

    const patientData = buildCompactPatientData({
      todayIso,
      painRows,
      sympRows,
      medList,
      testRows,
      diagRows,
      visitRows,
      qList,
      slogRows,
    })

    const narrativeFallback = buildNarrativeFallback({
      painRows,
      sympRows,
      medList,
      testRows,
      diagRows,
      visitRows,
      qList,
      painAvg,
      painTopAreas: areaTop,
      painTopTypes: typeTop,
      topSymptoms: symptomTop,
    })

    let aiText: string | null = null
    let aiError: string | null = null
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate-summary', {
        body: {
          patientData,
          patientFocus: patientFocus.trim() || undefined,
          mode: summaryMode,
        },
      })
      if (fnErr) throw fnErr
      const resp = fnData as { summary?: string; error?: string }
      if (resp?.error) throw new Error(resp.error)
      aiText = resp?.summary ?? null
      if (!aiText?.trim()) aiText = null
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
      console.warn('AI summary failed, using narrative fallback:', msg)
      aiError = msg
    }

    const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    setSummary({
      generatedAt,
      aiText,
      aiError,
      narrativeFallback,
      painCount: painRows.length,
      symptomCount: sympRows.length,
      medCount: medList.length,
      pendingTests,
      openQuestions: qList.length,
    })
    setSummaryLoading(false)
  }

  function handoffTextForPdf (s: HealthSummary) {
    return s.aiText?.trim() || s.narrativeFallback
  }

  function downloadPdf () {
    if (!summary) return
    downloadHealthSummaryPdf(handoffTextForPdf(summary), summary.generatedAt)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: summary ? 16 : 0, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>📋 Clinical handoff summary</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
              Narrative overview you can give to a doctor (not just counts). Uses your logs, meds, diagnoses, visits, tests, and open questions.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {summary && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={downloadPdf}
                style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              >
                Download PDF
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={summary ? () => setSummary(null) : generateSummary}
              disabled={summaryLoading}
              style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            >
              {summaryLoading ? 'Loading…' : summary ? 'Close' : 'Generate'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, paddingTop: 12, borderTop: summary ? '1px solid var(--border)' : 'none' }}>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Most important for my next appointment (optional)</label>
            <textarea
              value={patientFocus}
              onChange={(e) => setPatientFocus(e.target.value)}
              placeholder="e.g. Discuss whether new numbness could be medication-related; request referral timing; explain why I can’t work full-time right now."
              rows={3}
              style={{ width: '100%', fontSize: '0.88rem' }}
              disabled={summaryLoading}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>Depth:</span>
            <button
              type="button"
              className={`btn ${summaryMode === 'thorough' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
              disabled={summaryLoading}
              onClick={() => setSummaryMode('thorough')}>
              Thorough (recommended)
            </button>
            <button
              type="button"
              className={`btn ${summaryMode === 'fast' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
              disabled={summaryLoading}
              onClick={() => setSummaryMode('fast')}>
              Fast
            </button>
            <span className="muted" style={{ fontSize: '0.72rem' }}>Thorough uses a heavier model for richer narrative.</span>
          </div>
        </div>

        {summary && (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <div className="muted" style={{ fontSize: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              Generated {summary.generatedAt} · data window: ~90 days
              {summary.aiText && <span style={{ marginLeft: 8, color: '#6366f1' }}>· AI-enhanced narrative</span>}
              {!summary.aiText && !summary.aiError && <span style={{ marginLeft: 8, color: '#b45309' }}>· app-generated narrative</span>}
            </div>

            {/* AI ERROR BANNER */}
            {summary.aiError && (
              <div style={{
                background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
                padding: '10px 14px', fontSize: '0.82rem', color: '#92400e',
              }}>
                <strong>AI generation did not complete.</strong> Showing app-generated narrative instead (still a real summary, just not AI-enhanced).
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  Reason: {summary.aiError.length > 200 ? summary.aiError.slice(0, 200) + '…' : summary.aiError}
                </div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  To enable AI: deploy the Edge Function (<code>supabase functions deploy generate-summary</code>) and set <code>supabase secrets set ANTHROPIC_API_KEY=sk-ant-...</code>
                </div>
              </div>
            )}

            {/* THE NARRATIVE — AI text if available, otherwise a real narrative fallback */}
            <div style={{ fontSize: '0.92rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#1f2937' }}>
              {summary.aiText || summary.narrativeFallback}
            </div>

            {/* QUICK LINKS */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              <Link to="/app/records" className="muted" style={{ fontSize: '0.8rem' }}>→ Pain & symptoms</Link>
              <Link to="/app/meds" className="muted" style={{ fontSize: '0.8rem' }}>→ Meds</Link>
              <Link to="/app/tests" className="muted" style={{ fontSize: '0.8rem' }}>→ Tests</Link>
              <Link to="/app/diagnoses" className="muted" style={{ fontSize: '0.8rem' }}>→ Diagnoses</Link>
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
            <Link to="/app/diagnoses" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📋 Diagnoses directory</Link>
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
