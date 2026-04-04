import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parseTriggerTokens } from '../lib/parse'

function parseLocationToAreas (location: string): string[] {
  if (!location) return []
  return location.split(',').map((p) => p.trim()).filter(Boolean)
}

export default function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [painRows, setPainRows] = useState<{ location: string | null }[]>([])
  const [mcasRows, setMcasRows] = useState<{ trigger: string }[]>([])
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [expandPain, setExpandPain] = useState(false)
  const [expandMcas, setExpandMcas] = useState(false)

  useEffect(() => {
    if (!user) return
    const fetchPending = async () => {
      const { count } = await supabase
        .from('doctor_visits')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending')
      setPendingCount(count || 0)
    }
    fetchPending()
  }, [user])

  useEffect(() => {
    if (!user) return
    setTrendsLoading(true)
    void (async () => {
      const [{ data: pain }, { data: mcas }] = await Promise.all([
        supabase.from('pain_entries').select('location').eq('user_id', user.id).order('entry_date', { ascending: false }).limit(120),
        supabase.from('mcas_episodes').select('trigger').eq('user_id', user.id).order('episode_date', { ascending: false }).limit(120),
      ])
      setPainRows(pain ?? [])
      setMcasRows(mcas ?? [])
      setTrendsLoading(false)
    })()
  }, [user])

  const painTop = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of painRows) {
      for (const a of parseLocationToAreas(row.location ?? '')) {
        map.set(a, (map.get(a) ?? 0) + 1)
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [painRows])

  const mcasTop = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of mcasRows) {
      for (const t of parseTriggerTokens(row.trigger)) {
        map.set(t, (map.get(t) ?? 0) + 1)
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [mcasRows])

  const generateSummary = async () => {
    if (!user) return
    setIsGenerating(true)
    try {
      const { data: pain } = await supabase.from('pain_entries').select('location, intensity, entry_date').eq('user_id', user.id).order('entry_date', { ascending: false }).limit(8)
      const { data: mcas } = await supabase.from('mcas_episodes').select('trigger, episode_date').eq('user_id', user.id).order('episode_date', { ascending: false }).limit(8)
      const painLine = pain?.map((p) => p.location).filter(Boolean).join(', ') || '—'
      const mcasLine = mcas?.map((m) => m.trigger).filter(Boolean).join(', ') || '—'
      const summary = `Health summary (${new Date().toLocaleDateString()})\nRecent pain areas: ${painLine}\nRecent MCAS triggers: ${mcasLine}`
      await navigator.clipboard.writeText(summary)
      alert('Summary copied to your clipboard.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mb-5">
        <button
          type="button"
          onClick={() => navigate('/log?tab=pain')}
          className="flex flex-col items-center py-2.5 px-1 bg-white rounded-xl shadow-sm border border-slate-100 transition active:scale-95 min-h-[72px] justify-center"
        >
          <span className="text-lg mb-0.5" aria-hidden>🔥</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight text-center">Pain</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/log?tab=mcas')}
          className="flex flex-col items-center py-2.5 px-1 bg-white rounded-xl shadow-sm border border-slate-100 transition active:scale-95 min-h-[72px] justify-center"
        >
          <span className="text-lg mb-0.5" aria-hidden>🛡️</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight text-center">MCAS</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/log?tab=visit')}
          className="flex flex-col items-center py-2.5 px-1 bg-white rounded-xl shadow-sm border border-slate-100 transition active:scale-95 min-h-[72px] justify-center"
        >
          <span className="text-lg mb-0.5" aria-hidden>🩺</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight text-center">Visit</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/questions')}
          className="flex flex-col items-center py-2.5 px-1 bg-white rounded-xl shadow-sm border border-slate-100 transition active:scale-95 min-h-[72px] justify-center"
        >
          <span className="text-lg mb-0.5" aria-hidden>❓</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight text-center">Qs</span>
        </button>
      </div>

      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[28px] p-5 text-white mb-5 shadow-lg shadow-indigo-200">
        <div className="flex justify-between items-center gap-3 mb-1">
          <h2 className="text-lg font-bold m-0">Health snapshot</h2>
          <button
            type="button"
            onClick={generateSummary}
            disabled={isGenerating}
            className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-white/30 transition shrink-0"
          >
            {isGenerating ? 'Working…' : 'Generate summary'}
          </button>
        </div>
        <p className="text-indigo-100 text-xs m-0">Pain & MCAS highlights are copied as text — no separate records page needed.</p>
      </div>

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => navigate('/visits?tab=pending')}
          className="w-full mb-5 bg-amber-50 border border-amber-200 p-3 rounded-2xl flex justify-between items-center text-left"
        >
          <span className="text-amber-900 text-sm font-medium">Finish {pendingCount} pending visit{pendingCount === 1 ? '' : 's'}</span>
          <span className="text-amber-700 text-xs font-bold">Open →</span>
        </button>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-bold text-slate-800 m-0">Pain areas (recent)</h3>
          {painTop.length > 3 && (
            <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => setExpandPain((v) => !v)}>
              {expandPain ? 'Collapse' : 'Show all'}
            </button>
          )}
        </div>
        {trendsLoading ? (
          <p className="text-slate-400 text-sm m-0">Loading…</p>
        ) : painTop.length === 0 ? (
          <p className="text-slate-400 text-sm m-0">No pain logs yet.</p>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {(expandPain ? painTop : painTop.slice(0, 3)).map(([area, n]) => (
              <li key={area} className="flex justify-between text-sm text-slate-600">
                <span>{area}</span>
                <span className="text-slate-400">{n}×</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-bold text-slate-800 m-0">MCAS triggers (recent)</h3>
          {mcasTop.length > 3 && (
            <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => setExpandMcas((v) => !v)}>
              {expandMcas ? 'Collapse' : 'Show all'}
            </button>
          )}
        </div>
        {trendsLoading ? (
          <p className="text-slate-400 text-sm m-0">Loading…</p>
        ) : mcasTop.length === 0 ? (
          <p className="text-slate-400 text-sm m-0">No MCAS episodes yet.</p>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {(expandMcas ? mcasTop : mcasTop.slice(0, 3)).map(([trig, n]) => (
              <li key={trig} className="flex justify-between text-sm text-slate-600">
                <span>{trig}</span>
                <span className="text-slate-400">{n}×</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="mt-3 text-xs font-semibold text-indigo-600" onClick={() => navigate('/analytics')}>
          Full charts & trends →
        </button>
      </div>
    </div>
  )
}
