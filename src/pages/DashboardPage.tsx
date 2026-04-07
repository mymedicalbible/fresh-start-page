import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import type { User } from '@supabase/supabase-js'
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
import { generateOllamaHandoffSummary, handoffOllamaModelLabel, isOllamaCorsOrNetworkError, ollamaOriginsPowerShellSnippet } from '../lib/ollamaSummary'
type SummaryAiSource = 'app' | 'ollama'

const AI_SOURCE_STORAGE = 'mb-handoff-ai-source'

type UpcomingAppt = {
  id: string
  doctor: string | null
  specialty: string | null
  appointment_date: string
  appointment_time: string | null
  /** Matched from `doctors` when name lines up, for profile link */
  doctorId?: string | null
}

/** Calendar date in the user's timezone (avoid UTC drift from `toISOString`). */
function localISODate (d: Date = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normDoctorName (name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/^dr\.?\s+/i, '')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
}

function pendingVisitsForDoctor (byNorm: Record<string, number>, doc: string | null) {
  const d = doc?.trim()
  if (!d) return 0
  return byNorm[normDoctorName(d)] ?? 0
}

/** Matches Visits list: treat only explicit pending as pending (null/empty → complete). */
function isDoctorVisitPendingStatus (status: string | null | undefined) {
  return String(status ?? 'complete').trim().toLowerCase() === 'pending'
}

function scheduleApptNotifications (appts: UpcomingAppt[], pendingQMap: Record<string, number>) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const now = Date.now()
  for (const appt of appts) {
    const q = pendingQMap[appt.doctor ?? ''] ?? 0
    if (q === 0) continue
    const apptDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time ?? '09:00'}`)
    const notifyAt = apptDateTime.getTime() + 60 * 60 * 1000
    const delay = notifyAt - now
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        new Notification('Medical Bible — Log your visit', {
          body: `You had an appointment with ${appt.doctor ?? 'your doctor'} today. You have ${q} unanswered question${q !== 1 ? 's' : ''} — tap to log your visit.`,
          icon: '/icon-192.png',
        })
      }, delay)
    }
  }
}

type HealthSummary = {
  generatedAt: string
  aiText: string | null
  aiError: string | null
  /** When AI text is shown (Ollama only in this app) */
  aiProvider: 'ollama' | null
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

function scrapGreeting (): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function scrapDisplayName (user: User): string {
  const raw = user.user_metadata?.full_name
  if (typeof raw === 'string' && raw.trim()) {
    const first = raw.trim().split(/\s+/)[0]
    if (first) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }
  const email = user.email ?? ''
  const local = email.split('@')[0] ?? ''
  if (local) {
    const bit = local.split(/[._-]/)[0] ?? local
    if (bit) return bit.charAt(0).toUpperCase() + bit.slice(1).toLowerCase()
  }
  return 'there'
}

function ScrapSticker ({
  to, title, sub, tone,
}: { to: string; title: string; sub: string; tone: 'pink' | 'mint' | 'sky' }) {
  return (
    <Link to={to} className={`scrap-sticker scrap-sticker--${tone}`}>
      <span className="scrap-sticker-title">{title}</span>
      <span className="scrap-sticker-sub">{sub}</span>
    </Link>
  )
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
    <div className="summary-readable" style={{ display: 'grid', gap: 4 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'title')
          return <div key={idx} className="summary-readable-title">{b.content}</div>
        if (b.type === 'heading')
          return <div key={idx} className="summary-readable-heading">{b.content}</div>
        if (b.type === 'snapshot')
          return <div key={idx} className="summary-readable-snapshot">{b.content}</div>
        if (b.type === 'bullet')
          return <div key={idx} className="summary-readable-line">{b.content}</div>
        return <div key={idx} className="summary-readable-line">{b.content}</div>
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
  aiSource,
  focus,
  onFocusChange,
  onModeChange,
  onAiSourceChange,
  onGenerate,
  onClose,
  onDownload,
  onLoadArchived,
}: {
  summary: HealthSummary | null
  loading: boolean
  mode: 'fast' | 'thorough'
  aiSource: SummaryAiSource
  focus: string
  onFocusChange: (v: string) => void
  onModeChange: (v: 'fast' | 'thorough') => void
  onAiSourceChange: (v: SummaryAiSource) => void
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
      <div className="summary-modal-sheet" style={{
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
        <div className="summary-modal-header" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 20px 14px',
          borderBottom: '1.5px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <div className="summary-modal-header-title">
              Clinical handoff summary
            </div>
            <div className="summary-modal-header-sub muted">
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
        <div className="summary-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px' }}>

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

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Summary style</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([
                { id: 'app' as const, label: 'App only' },
                { id: 'ollama' as const, label: 'Ollama (local)' },
              ]).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`btn ${aiSource === id ? 'btn-mint' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  disabled={loading}
                  onClick={() => onAiSourceChange(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {aiSource === 'ollama' && (
              <p className="muted" style={{ fontSize: '0.72rem', marginTop: 8, marginBottom: 0 }}>
                Run Ollama locally (default model: <code style={{ fontSize: '0.85em' }}>{handoffOllamaModelLabel()}</code>
                ). Dev server proxies to <code style={{ fontSize: '0.85em' }}>127.0.0.1:11434</code>
                ; for production builds set <code style={{ fontSize: '0.85em' }}>VITE_OLLAMA_URL</code> or Ollama <code style={{ fontSize: '0.85em' }}>OLLAMA_ORIGINS</code>.
              </p>
            )}
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
                      {a.sourceAi
                        ? (a.aiKind === 'ollama' ? ' · Ollama' : ' · AI')
                        : ' · App'}
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
                {summary.aiText && summary.aiProvider === 'ollama' && (
                  <span style={{ marginLeft: 8, color: 'var(--mint-dark)' }}> · Ollama (local)</span>
                )}
                {summary.aiText && !summary.aiProvider && (
                  <span style={{ marginLeft: 8, color: 'var(--mint-dark)' }}> · AI</span>
                )}
                {!summary.aiText && summary.aiError && (
                  <span style={{ marginLeft: 8, color: 'var(--danger)' }}> · Ollama failed — showing app fallback</span>
                )}
                {!summary.aiText && !summary.aiError && <span style={{ marginLeft: 8 }}> · app-generated</span>}
              </div>

              {summary.aiError && (
                <div className="banner error" style={{ marginBottom: 0, fontSize: '0.82rem' }}>
                  <strong>Ollama did not return a summary.</strong>
                  {isOllamaCorsOrNetworkError(summary.aiError) ? (
                    <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                      <div>The browser cannot reach Ollama (often CORS). Allow this site and vite dev in <code style={{ fontSize: '0.85em' }}>OLLAMA_ORIGINS</code>, then restart Ollama from the Start menu so it picks up the variable.</div>
                      <div style={{ marginTop: 8, background: '#fff', padding: '8px 10px', borderRadius: 8, fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}>
                        {ollamaOriginsPowerShellSnippet(typeof window !== 'undefined' ? window.location.origin : 'https://your-app.example')}
                      </div>
                      <div className="muted" style={{ marginTop: 8, fontSize: '0.72rem' }}>
                        Tip: Running <code style={{ fontSize: '0.85em' }}>npm run dev</code> uses a same-origin proxy to Ollama (no CORS). Use that for local testing without changing Ollama.
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, fontSize: '0.73rem', color: 'var(--muted)' }}>
                      {summary.aiError.length > 200 ? summary.aiError.slice(0, 200) + '…' : summary.aiError}
                      <div style={{ marginTop: 4 }}>Make sure Ollama is running: <code style={{ fontSize: '0.85em' }}>ollama serve</code></div>
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontWeight: 600, fontSize: '0.78rem' }}>
                    Showing app-generated narrative below as a fallback.
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
              {aiSource === 'ollama'
                ? 'Pulling your data and sending to Ollama… this may take a minute.'
                : 'Pulling your data and building the narrative…'}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  /** Pending `doctor_visits` counts keyed by `normDoctorName(doctor)` */
  const [pendingVisitsByNorm, setPendingVisitsByNorm] = useState<Record<string, number>>({})
  /** First-seen display name per norm key (for links / copy when there is no upcoming row). */
  const [pendingVisitLabelByNorm, setPendingVisitLabelByNorm] = useState<Record<string, string>>({})
  const [apptPendingQ, setApptPendingQ] = useState<Record<string, number>>({})
  const [openQsCount, setOpenQsCount] = useState<number | null>(null)
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryMode, setSummaryMode] = useState<'fast' | 'thorough'>('thorough')
  const [summaryAiSource, setSummaryAiSource] = useState<SummaryAiSource>('app')
  const [patientFocus, setPatientFocus] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('handoff') !== '1') return
    setSummaryOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!user) return
    async function load () {
      const today = localISODate()

      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('id, doctor, specialty, appointment_date, appointment_time, visit_logged')
        .eq('user_id', user!.id)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(8)
      if (apptErr) {
        console.warn('appointments:', apptErr.message)
        setUpcoming([])
      } else {
        const rows = (apptData ?? []) as (UpcomingAppt & { visit_logged?: boolean | null })[]
        const active = rows.filter((r) => r.visit_logged !== true) as UpcomingAppt[]

        const { data: docRows } = await supabase
          .from('doctors')
          .select('id, name, specialty, archived_at')
          .eq('user_id', user!.id)
        const byName = new Map<string, { id: string; specialty: string | null }>()
        for (const r of (docRows ?? []) as { id: string; name: string; specialty: string | null; archived_at?: string | null }[]) {
          if (r.archived_at) continue
          byName.set(normDoctorName(r.name), { id: r.id, specialty: r.specialty })
        }
        const enriched: UpcomingAppt[] = active.map((a) => {
          const docLabel = a.doctor?.trim() || null
          const hit = docLabel ? byName.get(normDoctorName(docLabel)) : undefined
          const spec = (a.specialty?.trim() || hit?.specialty?.trim() || null) as string | null
          return {
            ...a,
            doctor: docLabel,
            specialty: spec,
            doctorId: hit?.id ?? null,
          }
        })
        setUpcoming(enriched)

        if (enriched.length > 0) {
          const doctorNames = [...new Set(enriched.map((a) => a.doctor).filter(Boolean))]
          const { data: qRows } = await supabase
            .from('doctor_questions')
            .select('doctor')
            .eq('user_id', user!.id)
            .eq('status', 'Unanswered')
            .in('doctor', doctorNames)
          const qMap: Record<string, number> = {}
          for (const row of (qRows ?? []) as { doctor: string | null }[]) {
            if (row.doctor) qMap[row.doctor] = (qMap[row.doctor] ?? 0) + 1
          }
          setApptPendingQ(qMap)
          scheduleApptNotifications(enriched, qMap)
        } else {
          setApptPendingQ({})
        }
      }

      const { data: pendRows, error: pendErr } = await supabase
        .from('doctor_visits')
        .select('doctor, status')
        .eq('user_id', user!.id)
      if (pendErr) console.warn('doctor_visits (pending load):', pendErr.message)
      const pendMap: Record<string, number> = {}
      const pendLabels: Record<string, string> = {}
      for (const row of (pendRows ?? []) as { doctor: string | null; status?: string | null }[]) {
        if (!isDoctorVisitPendingStatus(row.status)) continue
        const d = row.doctor?.trim()
        if (!d) continue
        const k = normDoctorName(d)
        pendMap[k] = (pendMap[k] ?? 0) + 1
        if (pendLabels[k] === undefined) pendLabels[k] = d
      }
      setPendingVisitsByNorm(pendMap)
      setPendingVisitLabelByNorm(pendLabels)

      const { count: oq } = await supabase
        .from('doctor_questions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('status', 'Unanswered')
      setOpenQsCount(oq ?? 0)
    }
    void load()
  }, [user])

  useEffect(() => {
    try {
      const s = localStorage.getItem('mb-handoff-focus')
      if (s) setPatientFocus(s)
      const raw = localStorage.getItem(AI_SOURCE_STORAGE)
      if (raw === 'app' || raw === 'ollama') setSummaryAiSource(raw)
      else if (raw === 'cloud') {
        try { localStorage.setItem(AI_SOURCE_STORAGE, 'app') } catch { /* ignore */ }
        setSummaryAiSource('app')
      }
    } catch { /* ignore */ }
  }, [])

  function persistAiSource (v: SummaryAiSource) {
    setSummaryAiSource(v)
    try { localStorage.setItem(AI_SOURCE_STORAGE, v) } catch { /* ignore */ }
  }

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
    let aiProvider: 'ollama' | null = null

    if (summaryAiSource === 'ollama') {
      try {
        aiText = await generateOllamaHandoffSummary({
          patientData,
          patientFocus: patientFocus.trim() || undefined,
          mode: summaryMode,
        })
        if (!aiText?.trim()) aiText = null
        else aiProvider = 'ollama'
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
        console.warn('Ollama summary failed, using narrative fallback:', msg)
        aiError = msg
      }
    }

    const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const handoffText = (aiText?.trim() || narrativeFallback).trim()
    if (handoffText) {
      pushSummaryArchive({
        generatedLabel: generatedAt,
        text: handoffText,
        sourceAi: !!aiText?.trim(),
        aiKind: aiProvider ?? undefined,
      })
    }

    setSummary({
      generatedAt, aiText, aiError, aiProvider, narrativeFallback,
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
      aiProvider: entry.sourceAi && entry.aiKind === 'ollama' ? 'ollama' : null,
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

  const pendingDockEntries = Object.entries(pendingVisitsByNorm)
    .map(([norm, count]) => ({
      norm,
      count,
      label: pendingVisitLabelByNorm[norm] ?? norm,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  const hasAnyPendingVisits = pendingDockEntries.length > 0

  return (
    <>
      {/* SUMMARY MODAL */}
      {summaryOpen && (
        <SummaryModal
          summary={summary}
          loading={summaryLoading}
          mode={summaryMode}
          aiSource={summaryAiSource}
          focus={patientFocus}
          onFocusChange={setPatientFocus}
          onModeChange={setSummaryMode}
          onAiSourceChange={persistAiSource}
          onGenerate={generateSummary}
          onClose={() => setSummaryOpen(false)}
          onDownload={downloadPdf}
          onLoadArchived={applyArchivedSummary}
        />
      )}

      <div className="scrapbook-dashboard">

        <header className="scrap-dash-header">
          <h1 className="scrap-greeting">
            {scrapGreeting()}, {scrapDisplayName(user)}
          </h1>
          <div className="scrap-date-pill">
            {format(new Date(), 'EEEE, MMMM d')}
          </div>
        </header>

        <section className="scrap-sticky scrap-sticky--upcoming">
          <span className="scrap-tape scrap-tape--green" aria-hidden />
          <div className="scrap-sticky-label">UPCOMING</div>
          {upcoming.length > 0 && 'Notification' in window && Notification.permission === 'default' && (
            <button
              type="button"
              className="btn btn-ghost scrap-reminders-prompt"
              onClick={() => {
                void Notification.requestPermission().then((p) => {
                  if (p === 'granted') scheduleApptNotifications(upcoming, apptPendingQ)
                })
              }}
            >
              Enable visit reminders
            </button>
          )}
          {upcoming.length === 0 && !hasAnyPendingVisits && (
            <p className="scrap-body scrap-body--muted">Nothing scheduled yet.</p>
          )}
          {upcoming.length === 0 && hasAnyPendingVisits && (
            <div className="scrap-upcoming-pending-docked">
              <p className="scrap-body scrap-body--muted scrap-upcoming-pending-docked-intro">
                No upcoming appointments. Visits still waiting to be finished:
              </p>
              <ul className="scrap-upcoming-pending-dock-list">
                {pendingDockEntries.map(({ norm, count, label }) => (
                  <li key={norm}>
                    <button
                      type="button"
                      className="scrap-pending-line scrap-pending-line--in-hero"
                      onClick={() => navigate(`/app/visits?tab=pending&doctor=${encodeURIComponent(label)}`)}
                    >
                      {count === 1
                        ? `1 visit with ${label} needs finishing — tap here`
                        : `${count} visits with ${label} need finishing — tap here`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {upcoming.length > 0 && (
            <>
              <div className="scrap-upcoming-hero">
                <div className="scrap-upcoming-hero-label">Next appointment</div>
                {upcoming[0].doctorId ? (
                  <Link to={`/app/doctors/${upcoming[0].doctorId}`} className="scrap-upcoming-hero-name">
                    {upcoming[0].doctor}
                  </Link>
                ) : (
                  <div className="scrap-upcoming-hero-name">{upcoming[0].doctor || 'Doctor'}</div>
                )}
                <div className="scrap-upcoming-hero-spec">
                  <span className="scrap-upcoming-hero-spec-k">Specialty</span>
                  {upcoming[0].specialty?.trim() ? ` · ${upcoming[0].specialty.trim()}` : ' · —'}
                </div>
                <div className="scrap-upcoming-hero-when">
                  {format(new Date(`${upcoming[0].appointment_date}T12:00:00`), 'EEEE, MMM d')}
                  {upcoming[0].appointment_time
                    ? ` at ${String(upcoming[0].appointment_time).slice(0, 5)}`
                    : ''}
                  {(() => {
                    const pq = apptPendingQ[upcoming[0].doctor ?? ''] ?? 0
                    if (pq <= 0) return null
                    return (
                      <span className="scrap-appt-q"> · {pq} open question{pq !== 1 ? 's' : ''}</span>
                    )
                  })()}
                </div>
                {(() => {
                  const n = pendingVisitsForDoctor(pendingVisitsByNorm, upcoming[0].doctor)
                  if (n <= 0) return null
                  const docDisp = upcoming[0].doctor || 'this doctor'
                  const q = `/app/visits?tab=pending&doctor=${encodeURIComponent(docDisp)}`
                  return (
                    <button
                      type="button"
                      className="scrap-pending-line scrap-pending-line--in-hero"
                      onClick={() => navigate(q)}
                    >
                      {n === 1
                        ? `1 visit with ${docDisp} needs finishing — tap here`
                        : `${n} visits with ${docDisp} need finishing — tap here`}
                    </button>
                  )
                })()}
              </div>
              {upcoming.length > 1 && (
                <ul className="scrap-sticky-list scrap-sticky-list--rest">
                  {upcoming.slice(1).map((u) => {
                    const pendingQ = apptPendingQ[u.doctor ?? ''] ?? 0
                    const pv = pendingVisitsForDoctor(pendingVisitsByNorm, u.doctor)
                    const docDisp = u.doctor || 'this doctor'
                    const pendingUrl = `/app/visits?tab=pending&doctor=${encodeURIComponent(docDisp)}`
                    return (
                      <li key={u.id} className="scrap-body scrap-upcoming-list-item">
                        <div>
                          {format(new Date(`${u.appointment_date}T12:00:00`), 'MMM d')}
                          {u.appointment_time ? ` at ${String(u.appointment_time).slice(0, 5)}` : ''}
                          {' — '}
                          {u.doctorId
                            ? (
                              <Link to={`/app/doctors/${u.doctorId}`} className="scrap-upcoming-list-link">
                                {u.doctor}
                              </Link>
                              )
                            : (u.doctor || '—')}
                          {u.specialty?.trim() ? ` (${u.specialty.trim()})` : ''}
                          {pendingQ > 0 && (
                            <span className="scrap-appt-q"> {pendingQ} question{pendingQ !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        {pv > 0 && (
                          <button
                            type="button"
                            className="scrap-pending-line scrap-pending-line--in-list"
                            onClick={() => navigate(pendingUrl)}
                          >
                            {pv === 1
                              ? `1 visit with ${docDisp} needs finishing — tap here`
                              : `${pv} visits with ${docDisp} need finishing — tap here`}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        <h2 className="scrap-heading scrap-heading--section">log today</h2>
        <div className="scrap-log-grid">
          <Link to="/app/log?tab=pain" className="scrap-log-tile scrap-log-tile--pink">
            <span className="scrap-tape scrap-tape--pink" aria-hidden />
            <span className="scrap-log-title">Pain</span>
            <span className="scrap-log-sub">Log a pain entry</span>
          </Link>
          <Link to="/app/log?tab=symptoms" className="scrap-log-tile scrap-log-tile--green">
            <span className="scrap-tape scrap-tape--mint" aria-hidden />
            <span className="scrap-log-title">Episodes</span>
            <span className="scrap-log-sub">Log an episode</span>
          </Link>
          <Link to="/app/questions" className="scrap-log-tile scrap-log-tile--blue">
            <span className="scrap-tape scrap-tape--sky" aria-hidden />
            {openQsCount != null && openQsCount > 0 && (
              <span className="scrap-log-badge">{openQsCount > 99 ? '99+' : openQsCount}</span>
            )}
            <span className="scrap-log-title">Questions</span>
            <span className="scrap-log-sub">Add for your doctor</span>
          </Link>
          <Link to="/app/visits?new=1" className="scrap-log-tile scrap-log-tile--yellow">
            <span className="scrap-tape scrap-tape--butter" aria-hidden />
            <span className="scrap-log-title">Visit log</span>
            <span className="scrap-log-sub">Record a visit</span>
          </Link>
        </div>

        <section className="scrap-handoff">
          <span className="scrap-tape scrap-tape--brown" aria-hidden />
          <div className="scrap-handoff-row">
            <span className="scrap-handoff-title">Doctor handoff summary</span>
            <button
              type="button"
              className="scrap-handoff-open"
              onClick={() => setSummaryOpen(true)}
            >
              open →
            </button>
          </div>
        </section>

        <h2 className="scrap-heading scrap-heading--section">your records</h2>
        <div className="scrap-sticker-grid">
          <ScrapSticker to="/app/doctors" title="Doctors" sub="Profiles & visits" tone="mint" />
          <ScrapSticker to="/app/diagnoses" title="Diagnoses" sub="Your conditions" tone="pink" />
          <ScrapSticker to="/app/meds" title="Medications" sub="What you take" tone="sky" />
        </div>

        <p className="scrap-dash-account-line">
          <Link to="/app/profile" className="scrap-dash-footer-link">Account</Link>
        </p>

      </div>
    </>
  )
}
