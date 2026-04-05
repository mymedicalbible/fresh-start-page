import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadHealthSummaryPdf } from '../lib/summaryPdf'
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
  /** Lines for PDF / fallback when AI missing */
  diagnosisLines: string[]
  recentTestLines: string[]
  questionLines: string[]
  symptomLogLines: string[]
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

function formatPainRow (r: Record<string, unknown>) {
  const parts = [
    r.entry_date as string,
    (r as any).entry_time ? String((r as any).entry_time) : null,
    typeof r.intensity === 'number' ? `intensity ${r.intensity}/10` : null,
    r.location ? `location: ${r.location}` : null,
    r.pain_type ? `type: ${r.pain_type}` : null,
    r.triggers ? `triggers: ${r.triggers}` : null,
    r.relief_methods ? `relief tried: ${r.relief_methods}` : null,
    r.notes ? `notes: ${r.notes}` : null,
  ].filter(Boolean)
  return `• ${parts.join(' · ')}`
}

function formatEpisodeRow (r: Record<string, unknown>) {
  const parts = [
    r.episode_date as string,
    (r as any).episode_time ? String((r as any).episode_time) : null,
    r.severity ? `severity: ${r.severity}` : null,
    r.symptoms ? `symptoms: ${r.symptoms}` : null,
    r.activity ? `activity/context: ${r.activity}` : null,
    r.relief ? `relief: ${r.relief}` : null,
    r.notes ? `notes: ${r.notes}` : null,
  ].filter(Boolean)
  return `• ${parts.join(' · ')}`
}

function formatVisitRow (r: Record<string, unknown>) {
  const parts = [
    r.visit_date as string,
    r.doctor ? `with ${r.doctor}` : null,
    r.specialty ? `(${r.specialty})` : null,
    r.reason ? `reason: ${r.reason}` : null,
    r.findings ? `findings: ${r.findings}` : null,
    r.tests_ordered ? `tests/orders: ${r.tests_ordered}` : null,
    r.instructions ? `plan/instructions: ${r.instructions}` : null,
    r.follow_up ? `follow-up: ${r.follow_up}` : null,
    r.notes ? `notes: ${r.notes}` : null,
  ].filter(Boolean)
  return `• ${parts.join(' · ')}`
}

function buildFallbackHandoffText (s: HealthSummary): string {
  const lines: string[] = [
    'CLINICAL HANDOFF (structured fallback — configure Claude in Supabase for a fuller narrative)',
    '',
    'This section was assembled from the patient app without AI. Add detail in the app and regenerate when AI is available.',
    '',
    'CHIEF CONCERN AND RECENT COURSE',
    `Over approximately the last month the patient logged ${s.painCount} pain entr${s.painCount !== 1 ? 'ies' : 'y'}`
      + (s.painAvgIntensity != null ? ` with mean intensity about ${s.painAvgIntensity}/10` : '')
      + ` and ${s.symptomCount} symptom episode${s.symptomCount !== 1 ? 's' : ''}.`
      + (s.painTopAreas.length ? ` Pain was often reported in: ${s.painTopAreas.map((a) => a.area).join(', ')}.` : '')
      + (s.topSymptoms.length ? ` Frequent symptoms included: ${s.topSymptoms.slice(0, 6).map((x) => x.symptom).join(', ')}.` : ''),
    '',
    'MEDICATIONS ON FILE',
    s.medCount ? `${s.medCount} medication${s.medCount !== 1 ? 's' : ''} listed in the app (see Medications screen for doses).` : 'No medications listed in the app.',
    '',
    'KNOWN DIAGNOSES (FROM APP DIRECTORY)',
    s.diagnosisLines?.length ? s.diagnosisLines.join('\n') : 'None recorded in the diagnoses directory, or not loaded.',
    '',
    'RECENT VISITS (SUMMARY)',
    s.recentVisitCount
      ? `${s.recentVisitCount} visit${s.recentVisitCount !== 1 ? 's' : ''} in the lookback window.`
        + (s.lastVisitDate ? ` Most recent: ${s.lastVisitDate}${s.lastVisitDoctor ? ` with ${s.lastVisitDoctor}` : ''}.` : '')
      : 'No recent visits logged in the app for this window.',
    '',
    'TESTS AND WORKUP',
    s.pendingTests
      ? `${s.pendingTests} test order${s.pendingTests !== 1 ? 's' : ''} still marked pending.`
      : 'No pending tests in the app.',
    (s.recentTestLines?.length ? s.recentTestLines.join('\n') : ''),
    '',
    'QUESTIONS THE PATIENT IS TRACKING',
    s.openQuestions
      ? `${s.openQuestions} open question${s.openQuestions !== 1 ? 's' : ''} in the app.`
      : 'No unanswered questions flagged.',
    (s.questionLines?.length ? s.questionLines.join('\n') : ''),
    '',
    'QUICK SYMPTOM LOG SNAPSHOTS',
    (s.symptomLogLines?.length ? s.symptomLogLines.join('\n') : 'None in the selected window.'),
  ]
  return lines.join('\n')
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
        .limit(35),
      supabase.from('mcas_episodes')
        .select('episode_date, episode_time, activity, symptoms, severity, relief, notes')
        .eq('user_id', user.id)
        .gte('episode_date', since90Str)
        .order('episode_date', { ascending: false })
        .limit(35),
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
    const severityCounts: Record<string, number> = {}
    for (const r of sympRows) {
      const s = (r.severity as string) ?? 'Unknown'
      severityCounts[s] = (severityCounts[s] ?? 0) + 1
    }

    const painLogText = painRows.length
      ? painRows.slice(0, 30).map((r) => formatPainRow(r)).join('\n')
      : '(No pain log lines in the last ~90 days.)'
    const episodeLogText = sympRows.length
      ? sympRows.slice(0, 30).map((r) => formatEpisodeRow(r)).join('\n')
      : '(No symptom / MCAS episode lines in the last ~90 days.)'
    const medText = medList.length
      ? medList.map((m) => {
        const p = [m.medication, m.dose, m.frequency, m.purpose].filter(Boolean).join(' · ')
        const n = m.notes ? ` (${m.notes})` : ''
        return `• ${p}${n}`
      }).join('\n')
      : '(No medications listed in the app.)'
    const testText = testRows.length
      ? testRows.slice(0, 35).map((t) => {
        const bits = [t.test_date as string, t.test_name as string, `status: ${t.status}`]
        if (t.doctor) bits.push(`ordered by: ${t.doctor}`)
        if (t.reason) bits.push(`reason: ${t.reason}`)
        if (t.results) bits.push(`results: ${t.results}`)
        return `• ${bits.join(' · ')}`
      }).join('\n')
      : '(No tests / orders recorded.)'
    const diagText = diagRows.length
      ? diagRows.map((d) => `• ${d.diagnosis as string} — ${d.status as string}${d.date_diagnosed ? ` (since ${d.date_diagnosed})` : ''}${d.doctor ? ` · ${d.doctor}` : ''}`).join('\n')
      : '(No entries in diagnoses directory.)'
    const visitText = visitRows.length
      ? visitRows.map((v) => formatVisitRow(v)).join('\n')
      : '(No doctor visits logged in the app in this window.)'
    const questionText = qList.length
      ? qList.map((q) => `• [${q.priority ?? '?'}] ${q.question as string}${q.doctor ? ` (re: ${q.doctor})` : ''} — logged ${q.date_created as string}`).join('\n')
      : '(No open questions flagged.)'
    const slogText = slogRows.length
      ? slogRows.map((r) => {
        const when = r.logged_at?.slice(0, 16)?.replace('T', ' ') ?? ''
        const acts = r.activity_last_4h ? `Activity ~4h: ${r.activity_last_4h}` : ''
        const sy = Array.isArray(r.symptoms) && r.symptoms.length ? `Symptoms: ${r.symptoms.join(', ')}` : ''
        return `• ${when}${acts ? ` · ${acts}` : ''}${sy ? ` · ${sy}` : ''}`
      }).join('\n')
      : '(No structured symptom log snapshots in this window.)'

    const diagnosisLines = diagRows.length
      ? diagRows.map((d) => `• ${d.diagnosis as string} — ${d.status as string}`)
      : []
    const recentTestLines = testRows.slice(0, 15).map((t) => {
      const bits = [String(t.test_date), String(t.test_name), String(t.status)]
      return `• ${bits.join(' · ')}`
    })
    const questionLines = qList.map((q) => `• ${q.question as string}`)
    const symptomLogLines = slogRows.map((r) => {
      const sy = Array.isArray(r.symptoms) ? r.symptoms.join(', ') : ''
      return `• ${r.logged_at?.slice(0, 10)} — ${sy || r.activity_last_4h || '—'}`
    })

    const dataBlock = [
      '=== PAIN LOG (most recent first, ~90 days) ===',
      painLogText,
      '',
      '=== SYMPTOM / EPISODE LOG (MCAS-type entries, ~90 days) ===',
      episodeLogText,
      '',
      '=== STRUCTURED SYMPTOM SNAPSHOTS (if used) ===',
      slogText,
      '',
      '=== MEDICATIONS ===',
      medText,
      '',
      '=== DIAGNOSES DIRECTORY ===',
      diagText,
      '',
      '=== RECENT DOCTOR VISITS (narrative fields) ===',
      visitText,
      '',
      '=== TESTS & ORDERS (recent, all statuses) ===',
      testText,
      '',
      '=== OPEN QUESTIONS (patient is waiting on answers) ===',
      questionText,
    ].join('\n')

    const prompt = [
      'You are preparing a clinical handoff document for a physician.',
      'The patient will print or share this with a clinician (for example a new specialist, primary care, or emergency provider) so they can quickly understand the patient\'s situation.',
      '',
      'Instructions:',
      '- Write in clear, professional prose suitable for a doctor\'s quick read. Avoid fluff, motivational language, and generic reassurance.',
      '- Ground every claim in the PATIENT DATA below. If something is missing, say briefly that it was not recorded in the app.',
      '- Do NOT state new diagnoses, change treatment plans, or give medical instructions. You may organize and summarize what was already recorded.',
      '- Length: about 650–1100 words unless the data are very sparse (then shorter is fine).',
      '',
      'Use exactly these section headings as plain lines (all caps), each on its own line, followed by one or more paragraphs of narrative:',
      '',
      'CHIEF CONCERN AND FUNCTIONAL IMPACT',
      'RECENT PAIN AND SYMPTOM COURSE',
      'CURRENT MEDICATIONS',
      'KNOWN DIAGNOSES AND BACKGROUND',
      'RECENT ENCOUNTERS AND PLANS',
      'PENDING TESTS, RESULTS, AND FOLLOW-UP',
      'QUESTIONS AND GAPS FOR THE NEXT CLINICIAN',
      '',
      'Under CURRENT MEDICATIONS, list each medication with dose and frequency as given in the data; if incomplete in the data, say so.',
      'Under RECENT ENCOUNTERS, summarize the last few visits from what was logged (reason, findings, tests ordered, instructions) in narrative form.',
      'Under PENDING TESTS, distinguish pending orders vs completed tests with results if they appear in the data.',
      'Under QUESTIONS AND GAPS, include the patient\'s open questions verbatim where helpful.',
      '',
      'PATIENT DATA:',
      dataBlock,
    ].join('\n')

    let aiText: string | null = null
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate-summary', {
        body: { prompt },
      })
      if (fnErr) throw fnErr
      aiText = (fnData as { summary?: string })?.summary ?? null
    } catch (aiErr) {
      console.warn('Claude summary failed, falling back to structured text:', aiErr)
    }

    const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    setSummary({
      generatedAt,
      aiText,
      diagnosisLines,
      recentTestLines,
      questionLines,
      symptomLogLines,
      painCount: painRows.length,
      painAvgIntensity: painAvg,
      painTopAreas: areaTop,
      painTopTypes: typeTop,
      symptomCount: sympRows.length,
      topSymptoms: symptomTop,
      severityCounts,
      medCount: medList.length,
      pendingTests,
      openQuestions: qList.length,
      recentVisitCount: visitRows.length,
      lastVisitDate: (visitRows[0]?.visit_date as string) ?? null,
      lastVisitDoctor: (visitRows[0]?.doctor as string) ?? null,
    })
    setSummaryLoading(false)
  }

  function handoffTextForPdf (s: HealthSummary) {
    return s.aiText?.trim()
      ? s.aiText.trim()
      : buildFallbackHandoffText(s)
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

        {summary && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="muted" style={{ fontSize: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              Generated {summary.generatedAt} · data window about the last 90 days where noted
              {summary.aiText && <span style={{ marginLeft: 8, color: '#6366f1' }}>· Claude narrative</span>}
              {!summary.aiText && <span style={{ marginLeft: 8, color: '#b45309' }}>· structured fallback (set up AI for full narrative)</span>}
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
