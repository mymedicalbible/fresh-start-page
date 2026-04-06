import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadHealthSummaryPdf } from '../lib/summaryPdf'
import { buildCompactPatientData } from '../lib/summaryContext'
import { buildHandoffNarrative } from '../lib/handoffNarrative'
import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  formatCorrelationBlock,
} from '../lib/medSymptomCorrelation'
import { useAuth } from '../contexts/AuthContext'
import { EpisodeSummaryChart, PainSummaryChart } from '../components/summaryCharts'
import { buildEpisodeChartSeries, buildPainChartSeries, type EpisodeChartPoint, type PainChartPoint } from '../lib/summaryChartData'
import { deleteSummaryArchiveItem, loadSummaryArchive, pushSummaryArchive, type ArchivedHandoffSummary } from '../lib/summaryArchive'

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
  narrativeFallback: string
  /** Supabase error when loading medication_change_events (if any) */
  medEventsLoadError: string | null
  /** Same correlation text shown in narrative; highlighted separately in the modal */
  medCorrelationBlock: string
  painCount: number
  symptomCount: number
  medCount: number
  pendingTests: number
  openQuestions: number
  painChart: PainChartPoint[]
  episodeChart: EpisodeChartPoint[]
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

// ────────────────────────────────────────────────────────────
// NARRATIVE RENDERER — turns plain-text summary into styled sections
// ────────────────────────────────────────────────────────────
const SECTION_RE = /^[A-Z][A-Z &/()—\-.0-9]+(  .*)?$/

function NarrativeRenderer ({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: { type: 'title' | 'heading' | 'snapshot' | 'bullet' | 'text'; content: string }[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { i++; continue }

    if (i === 0 && trimmed.startsWith('PATIENT HEALTH SUMMARY')) {
      blocks.push({ type: 'title', content: trimmed })
    } else if (SECTION_RE.test(trimmed)) {
      blocks.push({ type: 'heading', content: trimmed })
      if (trimmed === 'CLINICAL SNAPSHOT' && i + 1 < lines.length) {
        i++
        while (i < lines.length && lines[i].trim() && !SECTION_RE.test(lines[i].trim())) {
          blocks.push({ type: 'snapshot', content: lines[i].trim() })
          i++
        }
        continue
      }
    } else if (trimmed.startsWith('•') || trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
      blocks.push({ type: 'bullet', content: trimmed })
    } else {
      blocks.push({ type: 'text', content: trimmed })
    }
    i++
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'title')
          return <div key={idx} style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--mint-ink)', paddingBottom: 6, borderBottom: '2px solid var(--mint)', marginBottom: 4 }}>{b.content}</div>
        if (b.type === 'heading')
          return <div key={idx} style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent)', letterSpacing: '0.04em', marginTop: 12, paddingBottom: 2, borderBottom: '1px solid var(--border)' }}>{b.content}</div>
        if (b.type === 'snapshot')
          return <div key={idx} style={{ fontSize: '0.9rem', lineHeight: 1.65, color: 'var(--text)', padding: '6px 12px', background: 'var(--mint-surface)', borderRadius: 8, borderLeft: '3px solid var(--accent)', marginBottom: 3 }}>{b.content}</div>
        if (b.type === 'bullet')
          return <div key={idx} style={{ fontSize: '0.88rem', lineHeight: 1.6, paddingLeft: 8, whiteSpace: 'pre-wrap' }}>{b.content}</div>
        return <div key={idx} style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.content}</div>
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// SUMMARY MODAL
// ────────────────────────────────────────────────────────────
function SummaryModal ({
  summary,
  loading,
  mode,
  focus,
  onFocusChange,
  onModeChange,
  onGenerate,
  onClose,
  onDownload,
  onLoadArchived,
}: {
  summary: HealthSummary | null
  loading: boolean
  mode: 'fast' | 'thorough'
  focus: string
  onFocusChange: (v: string) => void
  onModeChange: (v: 'fast' | 'thorough') => void
  onGenerate: () => void
  onClose: () => void
  onDownload: () => void
  onLoadArchived: (entry: ArchivedHandoffSummary) => void
}) {
  const [archive, setArchive] = useState<ArchivedHandoffSummary[]>([])
  useEffect(() => {
    setArchive(loadSummaryArchive())
  }, [summary?.generatedAt, loading])
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(30,77,52,0.18)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: '20px 20px 0 0',
        border: '1.5px solid var(--border)',
        borderBottom: 'none',
        width: '100%',
        maxWidth: 720,
        maxHeight: '92dvh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(30,77,52,0.14)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 20px 14px',
          borderBottom: '1.5px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--mint-ink)' }}>
              Clinical handoff summary
            </div>
            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
              Narrative for your next appointment
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg)', border: '1.5px solid var(--border)',
              borderRadius: 999, width: 32, height: 32,
              cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)',
            }}
          >
            x
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px' }}>

          {/* Focus field */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Most important for my next appointment (optional)</label>
            <textarea
              value={focus}
              onChange={(e) => onFocusChange(e.target.value)}
              placeholder="e.g. Discuss new numbness, request referral timing, explain fatigue impact..."
              rows={2}
              disabled={loading}
            />
          </div>

          {/* Mode + generate */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <button type="button"
              className={`btn ${mode === 'thorough' ? 'btn-mint' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              disabled={loading} onClick={() => onModeChange('thorough')}>
              Thorough
            </button>
            <button type="button"
              className={`btn ${mode === 'fast' ? 'btn-mint' : 'btn-secondary'}`}
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              disabled={loading} onClick={() => onModeChange('fast')}>
              Fast
            </button>
            <button type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.82rem' }}
              disabled={loading}
              onClick={onGenerate}>
              {loading ? 'Generating...' : summary ? 'Regenerate' : 'Generate'}
            </button>
            {summary && (
              <button type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem' }}
                onClick={onDownload}>
                Download PDF
              </button>
            )}
          </div>

          {/* Past summaries (this device) */}
          {archive.length > 0 && (
            <div style={{ marginBottom: 16, padding: '12px', background: 'var(--bg)', borderRadius: 12, border: '1.5px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8, color: 'var(--mint-ink)' }}>Saved summaries (this device)</div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {archive.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="muted" style={{ fontSize: '0.75rem', flex: 1, minWidth: 120 }}>
                      {new Date(a.savedAtIso).toLocaleString()} · {a.generatedLabel}
                      {a.sourceAi ? ' · AI' : ''}
                    </span>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      onClick={() => onLoadArchived(a)}>
                      Load
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 8px', color: 'var(--danger)' }}
                      onClick={() => { deleteSummaryArchiveItem(a.id); setArchive(loadSummaryArchive()) }}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {summary && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="muted" style={{ fontSize: '0.73rem', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                Generated {summary.generatedAt} · ~90-day data window
                {summary.aiText && <span style={{ marginLeft: 8, color: 'var(--mint-dark)' }}> · AI-enhanced</span>}
                {!summary.aiText && !summary.aiError && <span style={{ marginLeft: 8 }}> · app-generated</span>}
              </div>

              {summary.aiError && (
                <div className="banner ai-warn" style={{ marginBottom: 0, fontSize: '0.82rem' }}>
                  <strong>AI generation did not complete.</strong> Showing app-generated narrative instead.
                  <div className="muted" style={{ fontSize: '0.73rem', marginTop: 4 }}>
                    {summary.aiError.length > 180 ? summary.aiError.slice(0, 180) + '...' : summary.aiError}
                  </div>
                </div>
              )}

              {summary.medEventsLoadError && (
                <div className="banner error" style={{ marginBottom: 0, fontSize: '0.82rem' }}>
                  <strong>Could not load medication change events.</strong>
                  <div style={{ marginTop: 6, fontSize: '0.78rem' }}>{summary.medEventsLoadError}</div>
                  <div style={{ marginTop: 8, fontSize: '0.78rem', background: '#fff', padding: '8px 10px', borderRadius: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {`Fix: open your Supabase SQL Editor and run the migration file:\n20250406200000_med_change_events_rpc.sql\n\nOr paste this:\nSELECT pg_notify('pgrst', 'reload schema');`}
                  </div>
                </div>
              )}

              {summary.painChart.length > 0 && (
                <div className="card" style={{ padding: 12 }}>
                  <PainSummaryChart data={summary.painChart} />
                </div>
              )}
              {summary.episodeChart.length > 0 && (
                <div className="card" style={{ padding: 12 }}>
                  <EpisodeSummaryChart data={summary.episodeChart} />
                </div>
              )}

              <NarrativeRenderer text={summary.aiText || summary.narrativeFallback} />

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                <Link to="/app/records" className="muted" style={{ fontSize: '0.8rem' }} onClick={onClose}>Pain &amp; episodes</Link>
                <Link to="/app/meds" className="muted" style={{ fontSize: '0.8rem' }} onClick={onClose}>Meds</Link>
                <Link to="/app/tests" className="muted" style={{ fontSize: '0.8rem' }} onClick={onClose}>Tests</Link>
                <Link to="/app/diagnoses" className="muted" style={{ fontSize: '0.8rem' }} onClick={onClose}>Diagnoses</Link>
                <Link to="/app/analytics" className="muted" style={{ fontSize: '0.8rem' }} onClick={onClose}>Charts</Link>
              </div>
            </div>
          )}

          {!summary && !loading && (
            <div className="muted" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
              Tap Generate to build your clinical handoff narrative from all your logs.
            </div>
          )}
          {loading && (
            <div className="muted" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
              Pulling your data and building the narrative...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ────────────────────────────────────────────────────────────
export function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryMode, setSummaryMode] = useState<'fast' | 'thorough'>('thorough')
  const [patientFocus, setPatientFocus] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    async function load () {
      const today = new Date().toISOString().slice(0, 10)

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

      try {
        const { count } = await supabase
          .from('doctor_visits')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('status', 'pending')
        setPendingCount(count ?? 0)
      } catch { setPendingCount(0) }
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
    const since120 = new Date()
    since120.setDate(since120.getDate() - 120)
    const since120Str = since120.toISOString().slice(0, 10)

    const [
      painRes, sympRes, medRes, testsRes, pendingTestsRes,
      diagRes, visitRes, qRes, symptomLogRes, medEventsRes,
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
        .select('medication, dose, frequency, start_date, purpose, effectiveness, notes')
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
      supabase.rpc('get_medication_change_events', {
        p_since: since120Str,
        p_limit: 50,
      }),
    ])

    const painRows = (painRes.data ?? []) as Record<string, unknown>[]
    const sympRows = (sympRes.data ?? []) as Record<string, unknown>[]
    const medList = (medRes.data ?? []) as Record<string, unknown>[]
    const testRows = (testsRes.data ?? []) as Record<string, unknown>[]
    const diagRows = (diagRes.data ?? []) as Record<string, unknown>[]
    const visitRows = (visitRes.data ?? []) as Record<string, unknown>[]
    const qList = (qRes.data ?? []) as Record<string, unknown>[]
    const slogRows = (symptomLogRes.error ? [] : (symptomLogRes.data ?? [])) as { logged_at: string; activity_last_4h: string | null; symptoms: string[] | null }[]

    let medChangeEvents: MedChangeEvent[] = []
    let medEventsLoadError: string | null = null

    if (medEventsRes.error) {
      // RPC failed — try direct table as fallback
      const fallback = await supabase.from('medication_change_events')
        .select('event_date, medication, event_type, dose_previous, dose_new, frequency_previous, frequency_new')
        .eq('user_id', user.id)
        .gte('event_date', since120Str)
        .order('event_date', { ascending: false })
        .limit(50)

      if (fallback.error) {
        medEventsLoadError = fallback.error.message
        console.warn('medication_change_events: RPC and direct query both failed.', medEventsRes.error.message, fallback.error.message)
      } else {
        medChangeEvents = (fallback.data ?? []) as MedChangeEvent[]
      }
    } else {
      medChangeEvents = (medEventsRes.data ?? []) as MedChangeEvent[]
    }

    // Augment medChangeEvents with synthetic "start" events for meds that predate
    // the medication_change_events feature (i.e. they exist in current_medications
    // with a start_date but have no matching event record).
    const eventedMeds = new Set(medChangeEvents.map((e) => e.medication.toLowerCase()))
    const syntheticStarts: MedChangeEvent[] = (medList as Record<string, unknown>[])
      .filter((m) => {
        const name = String(m.medication ?? '')
        const sd = String(m.start_date ?? '')
        return name && sd && !eventedMeds.has(name.toLowerCase())
      })
      .map((m) => ({
        event_date: String(m.start_date),
        medication: String(m.medication),
        event_type: 'start' as const,
        dose_previous: null,
        dose_new: m.dose != null ? String(m.dose) : null,
        frequency_previous: null,
        frequency_new: m.frequency != null ? String(m.frequency) : null,
      }))
    const allMedEvents = medEventsLoadError ? [] : [...medChangeEvents, ...syntheticStarts]

    const medCorrelationBlock = medEventsLoadError
      ? ''
      : formatCorrelationBlock(buildMedSymptomCorrelationLines(allMedEvents, painRows, sympRows, 21))

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
    try { localStorage.setItem('mb-handoff-focus', patientFocus) } catch { /* ignore */ }

    const patientData = buildCompactPatientData({
      todayIso, painRows, sympRows, medList, testRows, diagRows, visitRows, qList, slogRows, medChangeEvents: allMedEvents,
    })

    const narrativeFallback = buildHandoffNarrative({
      todayIso, painRows, sympRows, medList, testRows, diagRows, visitRows, qList, medChangeEvents: allMedEvents,
      medChangeEventsLoadError: medEventsLoadError,
      painAvg, painTopAreas: areaTop, painTopTypes: typeTop, topSymptoms: symptomTop,
    })

    let aiText: string | null = null
    let aiError: string | null = null
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('generate-summary', {
        body: { patientData, patientFocus: patientFocus.trim() || undefined, mode: summaryMode },
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

    const handoffText = (aiText?.trim() || narrativeFallback).trim()
    if (handoffText) {
      pushSummaryArchive({
        generatedLabel: generatedAt,
        text: handoffText,
        sourceAi: !!aiText?.trim(),
      })
    }

    setSummary({
      generatedAt, aiText, aiError, narrativeFallback,
      medEventsLoadError, medCorrelationBlock,
      painCount: painRows.length, symptomCount: sympRows.length, medCount: medList.length,
      pendingTests, openQuestions: qList.length,
      painChart: buildPainChartSeries(painRows, 60),
      episodeChart: buildEpisodeChartSeries(sympRows, 60),
    })
    setSummaryLoading(false)
  }

  function applyArchivedSummary (entry: ArchivedHandoffSummary) {
    setSummary({
      generatedAt: entry.generatedLabel,
      aiText: entry.sourceAi ? entry.text : null,
      aiError: null,
      narrativeFallback: entry.sourceAi ? '' : entry.text,
      medEventsLoadError: null,
      medCorrelationBlock: '',
      painCount: 0,
      symptomCount: 0,
      medCount: 0,
      pendingTests: 0,
      openQuestions: 0,
      painChart: [],
      episodeChart: [],
    })
  }

  function handoffTextForPdf (s: HealthSummary) {
    const main = s.aiText?.trim() || s.narrativeFallback
    if (s.medCorrelationBlock.trim() && !main.includes('MEDICATION CHANGES')) {
      return `${main}\n\n---\nMedication changes & outcomes (app-derived)\n\n${s.medCorrelationBlock}`
    }
    return main
  }

  function downloadPdf () {
    if (!summary) return
    downloadHealthSummaryPdf(handoffTextForPdf(summary), summary.generatedAt)
  }

  if (!user) return <div>Loading...</div>

  return (
    <>
      {/* SUMMARY MODAL */}
      {summaryOpen && (
        <SummaryModal
          summary={summary}
          loading={summaryLoading}
          mode={summaryMode}
          focus={patientFocus}
          onFocusChange={setPatientFocus}
          onModeChange={setSummaryMode}
          onGenerate={generateSummary}
          onClose={() => setSummaryOpen(false)}
          onDownload={downloadPdf}
          onLoadArchived={applyArchivedSummary}
        />
      )}

      <div style={{ display: 'grid', gap: 14, padding: '8px 0 40px' }}>

        {/* UPCOMING APPOINTMENTS */}
        {upcoming.length > 0 && (
          <div className="banner info" style={{ marginBottom: 0 }}>
            <strong>Upcoming appointments</strong>
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
            className="btn btn-butter btn-block"
            onClick={() => navigate('/app/visits?tab=pending')}
            style={{ justifyContent: 'space-between', textAlign: 'left' }}
          >
            <span>{pendingCount} pending visit{pendingCount !== 1 ? 's' : ''} — finish them</span>
            <span style={{ fontWeight: 400 }}>Open →</span>
          </button>
        )}

        {/* LOG TODAY */}
        <div className="card">
          <span className="card-section-label">Log today</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 6 }}>
            <Link to="/app/log?tab=pain" className="log-tile blush">
              <span className="tile-label">Pain</span>
              <span className="tile-hint">Log a pain entry</span>
            </Link>
            <Link to="/app/log?tab=symptoms" className="log-tile mint">
              <span className="tile-label">Episodes</span>
              <span className="tile-hint">Log an episode</span>
            </Link>
            <Link to="/app/questions" className="log-tile sky">
              <span className="tile-label">Questions</span>
              <span className="tile-hint">Add a question for your doctor</span>
            </Link>
            <Link to="/app/visits?new=1" className="log-tile butter">
              <span className="tile-label">Visit log</span>
              <span className="tile-hint">Record a doctor visit</span>
            </Link>
          </div>
        </div>

        {/* HANDOFF SUMMARY — compact trigger card */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--mint-ink)' }}>
              Clinical handoff summary
            </div>
            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
              {summary
                ? `Generated ${summary.generatedAt}${summary.aiText ? ' · AI' : ' · app-generated'}`
                : 'Doctor-ready narrative from all your logs'}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-mint"
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => setSummaryOpen(true)}
          >
            {summary ? 'View / update' : 'Open'}
          </button>
        </div>

        {/* YOUR CARE & RECORDS */}
        <div className="card">
          <span className="card-section-label">Your care &amp; records</span>
          <div className="bento-grid" style={{ marginTop: 8 }}>
            <Link to="/app/doctors" className="bento-cell">
              <span>Doctors</span>
              <span className="bento-hint">Profiles &amp; visit history</span>
            </Link>
            <Link to="/app/diagnoses" className="bento-cell">
              <span>Diagnoses</span>
              <span className="bento-hint">Your diagnosis directory</span>
            </Link>
            <Link to="/app/tests" className="bento-cell">
              <span>Tests &amp; orders</span>
              <span className="bento-hint">Pending &amp; completed</span>
            </Link>
            <Link to="/app/meds" className="bento-cell">
              <span>Medications</span>
              <span className="bento-hint">Current &amp; archived meds</span>
            </Link>
            <Link to="/app/records" className="bento-cell">
              <span>Pain &amp; episodes</span>
              <span className="bento-hint">Browse your log archive</span>
            </Link>
            <Link to="/app/analytics" className="bento-cell">
              <span>Charts &amp; trends</span>
              <span className="bento-hint">Visualize your data</span>
            </Link>
          </div>
        </div>

      </div>
    </>
  )
}
