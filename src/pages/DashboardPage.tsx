import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { captureElementAsPng, downloadHealthSummaryPdf } from '../lib/summaryPdf'
import { buildHandoffNarrative } from '../lib/handoffNarrative'
import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  formatCorrelationBlock,
} from '../lib/medSymptomCorrelation'
import { useAuth } from '../contexts/AuthContext'
import { EpisodeSummaryChart, PainSummaryChart } from '../components/summaryCharts'
import { buildEpisodeChartSeries, buildPainChartSeries, type EpisodeChartPoint, type PainChartPoint } from '../lib/summaryChartData'
import { pushSummaryArchive } from '../lib/summaryArchive'
import { priorityLabelColor, priorityTackFill } from '../lib/priorityQuickLog'
import { PriorityTackIcon } from '../components/PriorityTackIcon'
import { LeaveLaterDialog } from '../components/LeaveLaterDialog'
import {
  clearApptQsDraft,
  loadApptQsDraft,
  saveApptQsDraft,
} from '../lib/apptQuestionsDraft'

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
        const doctorParam = appt.doctor ? encodeURIComponent(appt.doctor) : ''
        const deepLink = `/app/questions?tab=open${doctorParam ? `&doctor=${doctorParam}` : ''}`
        const n = new Notification('Medical Bible — Review your questions', {
          body: `Appointment with ${appt.doctor ?? 'your doctor'} just finished. You have ${q} unanswered question${q !== 1 ? 's' : ''} — tap to review.`,
          icon: '/icon-192.png',
          tag: `appt-${appt.appointment_date}-${doctorParam}`,
        })
        n.onclick = () => {
          window.focus()
          window.location.href = deepLink
        }
      }, delay)
    }
  }
}

type HealthSummary = {
  generatedAt: string
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
}: { to: string; title: string; sub: string; tone: 'pink' | 'mint' | 'sky' | 'cream' | 'lavender' }) {
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
  focus,
  painChartPdfRef,
  episodeChartPdfRef,
  handoffPdfVisualRef,
  onFocusChange,
  onModeChange,
  onGenerate,
  onDone,
  onCancelRequest,
  onDownload,
}: {
  summary: HealthSummary | null
  loading: boolean
  mode: 'fast' | 'thorough'
  focus: string
  painChartPdfRef: RefObject<HTMLDivElement>
  episodeChartPdfRef: RefObject<HTMLDivElement>
  handoffPdfVisualRef: RefObject<HTMLDivElement>
  onFocusChange: (v: string) => void
  onModeChange: (v: 'fast' | 'thorough') => void
  onGenerate: () => void
  onDone: () => void
  onCancelRequest: () => void
  onDownload: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(30,77,52,0.18)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelRequest() }}
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

          {/* Results */}
          {summary && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                ref={handoffPdfVisualRef}
                className="handoff-pdf-capture-root"
                style={{
                  display: 'grid',
                  gap: 12,
                  background: 'var(--surface)',
                  padding: 4,
                  borderRadius: 8,
                }}
              >
              <div className="muted" style={{ fontSize: '0.73rem', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                Generated {summary.generatedAt} · ~90-day data window
                <span style={{ marginLeft: 8 }}> · app-generated</span>
              </div>

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
                <div ref={painChartPdfRef} className="card" style={{ padding: 12 }}>
                  <PainSummaryChart data={summary.painChart} />
                </div>
              )}
              {summary.episodeChart.length > 0 && (
                <div ref={episodeChartPdfRef} className="card" style={{ padding: 12 }}>
                  <EpisodeSummaryChart data={summary.episodeChart} />
                </div>
              )}

              <NarrativeRenderer text={summary.narrativeFallback} />

              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                <Link to="/app/records" className="muted" style={{ fontSize: '0.8rem' }} onClick={onDone}>Pain &amp; episodes</Link>
                <Link to="/app/meds" className="muted" style={{ fontSize: '0.8rem' }} onClick={onDone}>Meds</Link>
                <Link to="/app/tests" className="muted" style={{ fontSize: '0.8rem' }} onClick={onDone}>Tests</Link>
                <Link to="/app/diagnoses" className="muted" style={{ fontSize: '0.8rem' }} onClick={onDone}>Diagnoses</Link>
                <Link to="/app/analytics" className="muted" style={{ fontSize: '0.8rem' }} onClick={onDone}>Charts</Link>
              </div>
            </div>
          )}

          {!summary && !loading && (
            <div className="muted" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
              Tap Generate to build your clinical handoff narrative from all your logs.
            </div>
          )}
          {loading && (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.55, margin: '0 0 8px' }}>
                Pulling your last ~90 days of visits, medications, pain logs, episodes, and questions from the app…
              </p>
              <p className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.5, margin: 0, opacity: 0.9 }}>
                Then assembling your handoff narrative in the app.
              </p>
            </div>
          )}
        </div>

        <div style={{
          flexShrink: 0,
          display: 'flex',
          gap: 12,
          padding: '14px 20px 20px',
          borderTop: '1.5px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 50, fontSize: '1.05rem', fontWeight: 600 }} disabled={loading} onClick={onCancelRequest}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 50, fontSize: '1.05rem', fontWeight: 600 }} disabled={loading} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// PENDING VISIT STICKERS (long-press to dismiss)
// ────────────────────────────────────────────────────────────
type PendingEntry = { norm: string; count: number; label: string; resumeId: string | undefined }

function PendingVisitStickers ({
  entries,
  onNavigate,
  onDismiss,
}: {
  entries: PendingEntry[]
  onNavigate: (resumeId: string | undefined, label: string) => void
  onDismiss: (norm: string) => void
}) {
  const navigate = useNavigate()
  const [openCtx, setOpenCtx] = useState<string | null>(null)
  const [pressing, setPressing] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visibleEntries = entries.slice(0, 3)
  const hiddenCount = entries.length - visibleEntries.length

  function startPress (norm: string) {
    setPressing(norm)
    timerRef.current = setTimeout(() => {
      setOpenCtx(norm)
      setPressing(null)
    }, 600)
  }
  function cancelPress () {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    setPressing(null)
  }

  return (
    <div className="scrap-pending-section">
      <div className="scrap-pending-sticker-row">
        {visibleEntries.map(({ norm, count, label, resumeId }) => (
          <div key={norm} className="scrap-pending-sticker-wrapper">
            <button
              type="button"
              className={`scrap-pending-sticker${pressing === norm ? ' scrap-pending-sticker--pressed' : ''}`}
              onPointerDown={() => startPress(norm)}
              onPointerUp={() => { cancelPress(); if (openCtx !== norm) onNavigate(resumeId, label) }}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onClick={() => { if (openCtx === norm) setOpenCtx(null) }}
            >
              <div className="scrap-pending-sticker__doctor">{label}</div>
              {count > 1 && (
                <div className="scrap-pending-sticker__count">{count} unfinished</div>
              )}
              <span className="scrap-pending-sticker__hold">hold to dismiss</span>
            </button>
            {openCtx === norm && (
              <div className="scrap-pending-ctx" role="menu">
                <button type="button" className="scrap-pending-ctx__btn"
                  onClick={() => { setOpenCtx(null); onNavigate(resumeId, label) }}>
                  Continue this visit →
                </button>
                <button type="button" className="scrap-pending-ctx__btn scrap-pending-ctx__btn--danger"
                  onClick={() => { setOpenCtx(null); onDismiss(norm) }}>
                  Dismiss from dashboard
                </button>
                <button type="button" className="scrap-pending-ctx__btn"
                  style={{ color: '#64748b' }}
                  onClick={() => setOpenCtx(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="scrap-pending-more-row">
          <button
            type="button"
            className="scrap-pending-more-btn"
            onClick={() => navigate('/app/visits')}
          >
            +{hiddenCount} more visit{hiddenCount > 1 ? 's' : ''} →
          </button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ────────────────────────────────────────────────────────────
export function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname: dashPath, search: dashSearch } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const dashReturnTo = encodeURIComponent(`${dashPath}${dashSearch}`)
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  /** Pending `doctor_visits` counts keyed by `normDoctorName(doctor)` */
  const [pendingVisitsByNorm, setPendingVisitsByNorm] = useState<Record<string, number>>({})
  /** First-seen display name per norm key (for links / copy when there is no upcoming row). */
  const [pendingVisitLabelByNorm, setPendingVisitLabelByNorm] = useState<Record<string, string>>({})
  /** Latest pending `doctor_visits.id` per doctor (norm key) — opens visit wizard to finish. */
  const [pendingResumeIdByNorm, setPendingResumeIdByNorm] = useState<Record<string, string>>({})
  const [apptPendingQ, setApptPendingQ] = useState<Record<string, number>>({})
  const [openQsCount, setOpenQsCount] = useState<number | null>(null)
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryMode, setSummaryMode] = useState<'fast' | 'thorough'>('thorough')
  const [patientFocus, setPatientFocus] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLeavePrompt, setSummaryLeavePrompt] = useState(false)
  const summaryFocusAtOpenRef = useRef('')
  /** DOM roots for PDF chart capture (Recharts inside these cards) */
  const painChartPdfRef = useRef<HTMLDivElement>(null)
  const episodeChartPdfRef = useRef<HTMLDivElement>(null)
  const handoffPdfVisualRef = useRef<HTMLDivElement>(null)

  /** Live clock for banner label (ticks every 30 s) */
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  /** Bottom sheet: open questions for upcoming appt doctor — with inline answering */
  const [apptOpenQsPopup, setApptOpenQsPopup] = useState<null | {
    doctor: string
    loading: boolean
    loadError: string | null
    rows: { id: string; question: string; priority: string | null }[]
    answerDrafts: Record<string, string>
    savedIds: Set<string>
    savingId: string | null
  }>(null)

  const [apptQsLeavePrompt, setApptQsLeavePrompt] = useState(false)

  async function openApptQuestionsPopup (doctor: string) {
    if (!user?.id) return
    setApptOpenQsPopup({ doctor, loading: true, loadError: null, rows: [], answerDrafts: {}, savedIds: new Set(), savingId: null })
    const { data, error } = await supabase
      .from('doctor_questions')
      .select('id, question, priority, answer, status')
      .eq('user_id', user.id)
      .eq('doctor', doctor)
      .order('date_created', { ascending: false })
    if (error) {
      setApptOpenQsPopup((p) => p && ({ ...p, loading: false, loadError: error.message }))
      return
    }
    const open = (data ?? []).filter((q: { answer?: string | null; status?: string | null }) =>
      !String(q.answer ?? '').trim() && (q.status === 'Unanswered' || !q.status),
    ) as { id: string; question: string; priority: string | null }[]
    const stored = loadApptQsDraft(user.id, doctor)
    const merged: Record<string, string> = {}
    for (const r of open) {
      const t = stored[r.id]?.trim()
      if (t) merged[r.id] = stored[r.id]!
    }
    setApptOpenQsPopup((p) => p && ({ ...p, loading: false, rows: open, answerDrafts: merged }))
  }

  function apptQsHasUnsavedTyping () {
    if (!apptOpenQsPopup) return false
    const { rows, answerDrafts, savedIds } = apptOpenQsPopup
    return rows.some((r) => !savedIds.has(r.id) && String(answerDrafts[r.id] ?? '').trim().length > 0)
  }

  function requestCloseApptQsPopup () {
    if (!apptOpenQsPopup) return
    if (apptQsHasUnsavedTyping()) {
      setApptQsLeavePrompt(true)
      return
    }
    setApptOpenQsPopup(null)
  }

  function persistApptQsDraftFromPopup () {
    if (!apptOpenQsPopup || !user?.id) return
    const { doctor, answerDrafts, rows } = apptOpenQsPopup
    const prev = loadApptQsDraft(user.id, doctor)
    const next: Record<string, string> = { ...prev }
    for (const r of rows) {
      const t = (answerDrafts[r.id] ?? '').trim()
      if (t) next[r.id] = answerDrafts[r.id] ?? ''
    }
    saveApptQsDraft({ v: 1, userId: user.id, doctor, answerDrafts: next })
  }

  function finishApptQsDone () {
    persistApptQsDraftFromPopup()
    setApptOpenQsPopup(null)
  }

  function handleSummaryFooterDone () {
    setSummaryLeavePrompt(false)
    setSummaryOpen(false)
  }

  function handleSummaryCancelRequest () {
    if (summaryLoading) return
    const b = summaryFocusAtOpenRef.current
    const focusDirty = patientFocus.trim() !== b.trim()
    if (!focusDirty && summary === null) {
      setSummaryOpen(false)
      return
    }
    setSummaryLeavePrompt(true)
  }

  async function saveApptAnswer (id: string) {
    if (!apptOpenQsPopup || !user?.id) return
    const text = (apptOpenQsPopup.answerDrafts[id] ?? '').trim()
    if (!text) return
    setApptOpenQsPopup((p) => p && ({ ...p, savingId: id }))
    const { error } = await supabase
      .from('doctor_questions')
      .update({ answer: text, status: 'Answered' })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      setApptOpenQsPopup((p) => p && ({ ...p, savingId: null }))
      return
    }
    setApptOpenQsPopup((p) => {
      if (!p) return p
      const savedIds = new Set(p.savedIds)
      savedIds.add(id)
      return { ...p, savingId: null, savedIds }
    })
    // refresh banner count
    setApptPendingQ((prev) => {
      const doc = apptOpenQsPopup.doctor
      const cur = prev[doc] ?? 0
      if (cur <= 1) {
        const next = { ...prev }
        delete next[doc]
        return next
      }
      return { ...prev, [doc]: cur - 1 }
    })
  }

  useEffect(() => {
    if (searchParams.get('handoff') !== '1') return
    setSummaryOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!summaryOpen) return
    summaryFocusAtOpenRef.current = patientFocus
  }, [summaryOpen])

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
        .order('appointment_time', { ascending: true, nullsFirst: false })
        .limit(24)
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
        const byName = new Map<string, { id: string; name: string; specialty: string | null }>()
        for (const r of (docRows ?? []) as { id: string; name: string; specialty: string | null; archived_at?: string | null }[]) {
          if (r.archived_at) continue
          byName.set(normDoctorName(r.name), { id: r.id, name: r.name, specialty: r.specialty })
        }
        const enrichedAll: UpcomingAppt[] = active.map((a) => {
          const raw = typeof a.doctor === 'string' ? a.doctor.trim() : ''
          const docLabel = raw || null
          const hit = docLabel ? byName.get(normDoctorName(docLabel)) : undefined
          const spec = (a.specialty?.trim() || hit?.specialty?.trim() || null) as string | null
          const displayDoctor = (hit?.name ?? docLabel ?? '').trim() || null
          return {
            ...a,
            doctor: displayDoctor,
            specialty: spec,
            doctorId: hit?.id ?? null,
          }
        })
        /* Banner shows only the single closest upcoming visit */
        const enriched = enrichedAll.slice(0, 1)
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
        .select('id, doctor, status, visit_date, created_at')
        .eq('user_id', user!.id)
      if (pendErr) console.warn('doctor_visits (pending load):', pendErr.message)
      const pendingOnly = (pendRows ?? []).filter((row) =>
        isDoctorVisitPendingStatus((row as { status?: string | null }).status),
      ) as { id: string; doctor: string | null; visit_date: string; created_at: string | null }[]
      pendingOnly.sort((a, b) => {
        const da = a.visit_date || ''
        const db = b.visit_date || ''
        if (da !== db) return db.localeCompare(da)
        return String(b.created_at || '').localeCompare(String(a.created_at || ''))
      })
      const pendMap: Record<string, number> = {}
      const pendLabels: Record<string, string> = {}
      const resumeByNorm: Record<string, string> = {}
      for (const row of pendingOnly) {
        const d = row.doctor?.trim()
        if (!d) continue
        const k = normDoctorName(d)
        pendMap[k] = (pendMap[k] ?? 0) + 1
        if (pendLabels[k] === undefined) pendLabels[k] = d
        if (resumeByNorm[k] === undefined) resumeByNorm[k] = row.id
      }
      setPendingVisitsByNorm(pendMap)
      setPendingVisitLabelByNorm(pendLabels)
      setPendingResumeIdByNorm(resumeByNorm)

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
      diagRes, visitRes, qRes, medEventsRes,
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

    const narrativeFallback = buildHandoffNarrative({
      todayIso,
      patientFocus: patientFocus.trim() || undefined,
      painRows, sympRows, medList, testRows, diagRows, visitRows, qList, medChangeEvents: allMedEvents,
      medChangeEventsLoadError: medEventsLoadError,
      painAvg, painTopAreas: areaTop, painTopTypes: typeTop, topSymptoms: symptomTop,
    })

    const generatedAt = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const handoffText = narrativeFallback.trim()
    if (handoffText) {
      pushSummaryArchive({
        generatedLabel: generatedAt,
        text: handoffText,
        sourceAi: false,
      })
    }

    setSummary({
      generatedAt, narrativeFallback,
      medEventsLoadError, medCorrelationBlock,
      painCount: painRows.length, symptomCount: sympRows.length, medCount: medList.length,
      pendingTests, openQuestions: qList.length,
      painChart: buildPainChartSeries(painRows, 60),
      episodeChart: buildEpisodeChartSeries(sympRows, 60),
    })
    setSummaryLoading(false)
  }

  function handoffTextForPdf (s: HealthSummary) {
    const main = s.narrativeFallback
    if (s.medCorrelationBlock.trim() && !main.includes('MEDICATION CHANGES')) {
      return `${main}\n\n---\nMedication changes & outcomes (app-derived)\n\n${s.medCorrelationBlock}`
    }
    return main
  }

  async function downloadPdf () {
    if (!summary) return
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready
    }
    await new Promise<void>((r) => setTimeout(r, 500))
    const modalBody = document.querySelector('.summary-modal-body')
    if (modalBody instanceof HTMLElement) modalBody.scrollTop = 0
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const visual = handoffPdfVisualRef.current
      ? await captureElementAsPng(handoffPdfVisualRef.current)
      : null
    const pain = painChartPdfRef.current ? await captureElementAsPng(painChartPdfRef.current) : null
    const episode = episodeChartPdfRef.current ? await captureElementAsPng(episodeChartPdfRef.current) : null
    await downloadHealthSummaryPdf(handoffTextForPdf(summary), summary.generatedAt, {
      visual: visual ?? undefined,
      pain: pain ?? undefined,
      episode: episode ?? undefined,
    })
  }

  if (!user) return <div>Loading...</div>

  const pendingDockEntries = Object.entries(pendingVisitsByNorm)
    .map(([norm, count]) => ({
      norm,
      count,
      label: pendingVisitLabelByNorm[norm] ?? norm,
      resumeId: pendingResumeIdByNorm[norm],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  const hasAnyPendingVisits = pendingDockEntries.length > 0

  return (
    <>
      {/* SUMMARY MODAL */}
      {apptQsLeavePrompt && apptOpenQsPopup && user?.id && (
        <LeaveLaterDialog
          variant="saveForLater"
          onYes={() => {
            persistApptQsDraftFromPopup()
            setApptQsLeavePrompt(false)
            setApptOpenQsPopup(null)
          }}
          onNo={() => {
            clearApptQsDraft()
            setApptQsLeavePrompt(false)
            setApptOpenQsPopup(null)
          }}
          onStay={() => setApptQsLeavePrompt(false)}
        />
      )}

      {summaryLeavePrompt && (
        <LeaveLaterDialog
          variant="saveForLater"
          onYes={() => {
            try { localStorage.setItem('mb-handoff-focus', patientFocus) } catch { /* ignore */ }
            setSummaryLeavePrompt(false)
            setSummaryOpen(false)
          }}
          onNo={() => {
            setPatientFocus(summaryFocusAtOpenRef.current)
            setSummary(null)
            setSummaryLeavePrompt(false)
            setSummaryOpen(false)
          }}
          onStay={() => setSummaryLeavePrompt(false)}
        />
      )}

      {apptOpenQsPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="appt-open-qs-title"
          className="doctor-note-modal-backdrop"
          style={{ zIndex: 190, padding: '20px 16px' }}
          onClick={() => requestCloseApptQsPopup()}
          onKeyDown={(e) => { if (e.key === 'Escape') requestCloseApptQsPopup() }}
        >
          <div
            className="doctor-note-modal-panel"
            style={{ maxWidth: 520, maxHeight: '88dvh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — looks like the top of a notepad */}
            <div style={{
              padding: '18px 20px 14px',
              background: '#fffef8',
              borderBottom: '2px solid rgba(74,55,40,0.12)',
              flexShrink: 0,
            }}>
              <div className="doctor-note-modal-top" style={{ marginBottom: 0 }}>
                <div>
                  <h2 id="appt-open-qs-title" className="doctor-note-modal-title" style={{ fontSize: '1.18rem' }}>
                    Questions for {apptOpenQsPopup.doctor}
                  </h2>
                  {!apptOpenQsPopup.loading && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--scrap-muted)' }}>
                      {apptOpenQsPopup.rows.length - apptOpenQsPopup.savedIds.size > 0
                        ? `${apptOpenQsPopup.rows.length - apptOpenQsPopup.savedIds.size} unanswered — type your answers below`
                        : 'All answers logged ✓'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px', background: '#fffef8', display: 'grid', gap: 20 }}>
              {apptOpenQsPopup.loading && (
                <p style={{ textAlign: 'center', color: 'var(--scrap-muted)', padding: '28px 0' }}>
                  Loading your open questions for this doctor…
                </p>
              )}
              {apptOpenQsPopup.loadError && (
                <div className="banner error">{apptOpenQsPopup.loadError}</div>
              )}
              {!apptOpenQsPopup.loading && !apptOpenQsPopup.loadError && apptOpenQsPopup.rows.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--scrap-muted)', padding: '28px 0' }}>No open questions for this doctor.</p>
              )}

              {apptOpenQsPopup.rows.map((r) => {
                const saved = apptOpenQsPopup.savedIds.has(r.id)
                const saving = apptOpenQsPopup.savingId === r.id
                const draft = apptOpenQsPopup.answerDrafts[r.id] ?? ''
                const tackColor = priorityTackFill(r.priority)
                const labelColor = priorityLabelColor(r.priority)
                return (
                  <div key={r.id}>
                    {/* Question label */}
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ flexShrink: 0, marginTop: 3 }}><PriorityTackIcon color={tackColor} size={18} /></span>
                      <div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>
                          {r.priority ?? 'Medium'} priority
                        </span>
                        <div style={{ fontSize: '1rem', lineHeight: 1.45, color: 'var(--text)', fontWeight: 600 }}>
                          {r.question}
                        </div>
                      </div>
                    </div>

                    {/* Answer area */}
                    {saved ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        color: 'var(--mint-dark)', fontWeight: 600, fontSize: '0.9rem',
                        padding: '9px 14px', borderRadius: 10,
                        background: 'var(--mint-surface)',
                        border: '1.5px solid var(--mint)',
                      }}>
                        ✓ Answer logged
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span className="doctor-note-field-label" style={{ marginBottom: 4 }}>What did they say?</span>
                        <textarea
                          className="doctor-note-lined"
                          rows={4}
                          placeholder="Type your answer on the lines…"
                          value={draft}
                          onChange={(e) => setApptOpenQsPopup((p) => p && ({
                            ...p,
                            answerDrafts: { ...p.answerDrafts, [r.id]: e.target.value },
                          }))}
                          disabled={saving}
                        />
                        <button
                          type="button"
                          className="btn btn-mint"
                          style={{ alignSelf: 'flex-end', fontSize: '0.88rem', marginTop: 2 }}
                          disabled={!draft.trim() || saving}
                          onClick={() => { void saveApptAnswer(r.id) }}
                        >
                          {saving ? 'Saving…' : 'Save answer'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 20px 18px',
              borderTop: '1.5px solid rgba(74,55,40,0.12)',
              background: '#fffef8',
              display: 'grid',
              gap: 12,
              flexShrink: 0,
            }}>
              <Link
                className="btn btn-secondary btn-block"
                style={{ fontSize: '1.05rem', minHeight: 50, fontWeight: 600 }}
                to={`/app/questions?doctor=${encodeURIComponent(apptOpenQsPopup.doctor)}&tab=open`}
                onClick={() => finishApptQsDone()}
              >
                View all questions for this doctor
              </Link>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, minHeight: 50, fontSize: '1.05rem', fontWeight: 600 }}
                  onClick={() => requestCloseApptQsPopup()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, minHeight: 50, fontSize: '1.05rem', fontWeight: 600 }}
                  onClick={() => finishApptQsDone()}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {summaryOpen && (
        <SummaryModal
          summary={summary}
          loading={summaryLoading}
          mode={summaryMode}
          focus={patientFocus}
          painChartPdfRef={painChartPdfRef}
          episodeChartPdfRef={episodeChartPdfRef}
          handoffPdfVisualRef={handoffPdfVisualRef}
          onFocusChange={setPatientFocus}
          onModeChange={setSummaryMode}
          onGenerate={generateSummary}
          onDone={handleSummaryFooterDone}
          onCancelRequest={handleSummaryCancelRequest}
          onDownload={downloadPdf}
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

        {(() => {
          // Single banner label: upcoming / in progress / just finished (see timing below)
          const a = upcoming[0]
          let bannerLabel = 'UPCOMING'
          if (a) {
            const startMs = new Date(`${a.appointment_date}T${a.appointment_time ?? '00:00'}`).getTime()
            // treat 90 min past start as "over" if no explicit end time
            const endMs = startMs + 90 * 60 * 1000
            if (nowMs >= endMs) bannerLabel = 'MOST RECENT APPOINTMENT'
            else if (nowMs >= startMs) bannerLabel = 'CURRENT APPOINTMENT'
          }
          return (
        <section className="scrap-sticky scrap-sticky--upcoming">
          <span className="scrap-tape scrap-tape--green" aria-hidden />
          <div className="scrap-sticky-label">{bannerLabel}</div>
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
            <p className="scrap-body scrap-body--muted">No upcoming appointments — see unfinished logs below.</p>
          )}
          {upcoming.length > 0 && (
            <div className="scrap-upcoming-hero">
              {upcoming[0].doctorId ? (
                <Link to={`/app/doctors/${upcoming[0].doctorId}`} className="scrap-upcoming-hero-name">
                  {upcoming[0].doctor?.trim() || 'Doctor'}
                </Link>
              ) : (
                <div className="scrap-upcoming-hero-name">{upcoming[0].doctor?.trim() || 'Doctor'}</div>
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
                  const docName = upcoming[0].doctor?.trim()
                  const pq = apptPendingQ[docName ?? ''] ?? 0
                  if (pq <= 0 || !docName) return null
                  return (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="scrap-appt-q"
                        onClick={() => { void openApptQuestionsPopup(docName) }}
                      >
                        {pq} open question{pq !== 1 ? 's' : ''}
                      </button>
                    </>
                  )
                })()}
              </div>
              {(() => {
                const doc = upcoming[0].doctor?.trim()
                const norm = doc ? normDoctorName(doc) : ''
                const resumeId = norm ? pendingResumeIdByNorm[norm] : undefined
                const newUrl = doc
                  ? `/app/visits?new=1&doctor=${encodeURIComponent(doc)}&returnTo=${dashReturnTo}`
                  : `/app/visits?new=1&returnTo=${dashReturnTo}`
                return resumeId ? (
                  <Link
                    to={`/app/visits?resume=${resumeId}&returnTo=${dashReturnTo}`}
                    className="scrap-upcoming-visit-log-link scrap-upcoming-visit-log-link--continue"
                  >
                    Continue visit log — finish this appointment →
                  </Link>
                ) : (
                  <Link to={newUrl} className="scrap-upcoming-visit-log-link">
                    Start visit log for this appointment →
                  </Link>
                )
              })()}
            </div>
          )}
        </section>
          )
        })()}

        {/* Pending visit stickers — always outside/below the banner */}
        {hasAnyPendingVisits && (
          <PendingVisitStickers
            entries={pendingDockEntries}
            onNavigate={(resumeId, label) => {
              if (resumeId) navigate(`/app/visits?resume=${resumeId}&returnTo=${dashReturnTo}`)
              else navigate(`/app/visits?tab=pending&doctor=${encodeURIComponent(label)}&returnTo=${dashReturnTo}`)
            }}
            onDismiss={(norm) => {
              setPendingVisitsByNorm((prev) => {
                const next = { ...prev }
                delete next[norm]
                return next
              })
            }}
          />
        )}

        <h2 className="scrap-heading scrap-heading--section">log today</h2>
        <div className="scrap-log-grid">
          <Link to={`/app/log?tab=pain&returnTo=${dashReturnTo}`} className="scrap-log-tile scrap-log-tile--pink">
            <span className="scrap-tape scrap-tape--pink" aria-hidden />
            <span className="scrap-log-title">Pain</span>
            <span className="scrap-log-sub">Log a pain entry</span>
          </Link>
          <Link to={`/app/log?tab=symptoms&returnTo=${dashReturnTo}`} className="scrap-log-tile scrap-log-tile--green">
            <span className="scrap-tape scrap-tape--mint" aria-hidden />
            <span className="scrap-log-title">Episodes</span>
            <span className="scrap-log-sub">Log an episode</span>
          </Link>
          <Link to={`/app/log?tab=questions&returnTo=${dashReturnTo}`} className="scrap-log-tile scrap-log-tile--blue">
            <span className="scrap-tape scrap-tape--sky" aria-hidden />
            {openQsCount != null && openQsCount > 0 && (
              <span className="scrap-log-badge">{openQsCount > 99 ? '99+' : openQsCount}</span>
            )}
            <span className="scrap-log-title">Questions</span>
            <span className="scrap-log-sub">Add for your doctor</span>
          </Link>
          <Link to={`/app/visits?new=1&returnTo=${dashReturnTo}`} className="scrap-log-tile scrap-log-tile--yellow">
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
          <ScrapSticker to="/app/meds" title="Medications" sub="What you take" tone="sky" />
          <ScrapSticker to="/app/tests" title="Tests & orders" sub="Results & pending" tone="cream" />
        </div>

        <p className="scrap-dash-account-line">
          <Link to="/app/profile" className="scrap-dash-footer-link">Account</Link>
        </p>

      </div>
    </>
  )
}
