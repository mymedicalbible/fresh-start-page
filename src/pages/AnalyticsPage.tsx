import { useEffect, useMemo, useState } from 'react'
import { subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parseTriggerTokens } from '../lib/parse'

type PainRow = { id: string; entry_date: string; entry_time: string | null; location: string | null; intensity: number | null }
type McasRow = { id: string; episode_date: string; episode_time: string | null; trigger: string; severity: string | null }
type DayRange = '7' | '30' | 'all'

const AnalyticsPage = () => {
  const { user } = useAuth()
  const [range, setRange] = useState<DayRange>('30')
  const [painData, setPainData] = useState<PainRow[]>([])
  const [mcasData, setMcasData] = useState<McasRow[]>([])
  const [loading, setLoading] = useState(true)

  const [expandPain, setExpandPain] = useState(false)
  const [expandMcas, setExpandMcas] = useState(false)

  useEffect(() => {
    if (!user) return
    const fetchData = async () => {
      setLoading(true)
      const { data: p } = await supabase.from('pain_entries').select('*').eq('user_id', user.id)
      const { data: m } = await supabase.from('mcas_entries').select('*').eq('user_id', user.id)
      setPainData(p || [])
      setMcasData(m || [])
      setLoading(false)
    }
    fetchData()
  }, [user])

  const filteredPain = useMemo(() => {
    if (range === 'all') return painData
    const days = range === '7' ? 7 : 30
    const minDate = subDays(new Date(), days)
    return painData.filter((r) => new Date(r.entry_date) >= minDate)
  }, [painData, range])

  const filteredMcas = useMemo(() => {
    if (range === 'all') return mcasData
    const days = range === '7' ? 7 : 30
    const minDate = subDays(new Date(), days)
    return mcasData.filter((r) => new Date(r.episode_date) >= minDate)
  }, [mcasData, range])

  const areaStats = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredPain.forEach((r) => { if (r.location) counts[r.location] = (counts[r.location] || 0) + 1 })
    return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [filteredPain])

  const triggerStats = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredMcas.forEach((r) => {
      const tokens = parseTriggerTokens(r.trigger)
      tokens.forEach((t) => { counts[t] = (counts[t] || 0) + 1 })
    })
    return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }, [filteredMcas])

  if (loading) return <div className="p-8 text-center animate-pulse">Loading Trends...</div>

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <select value={range} onChange={(e) => setRange(e.target.value as DayRange)} className="bg-white border-none rounded-xl text-sm font-bold p-2 shadow-sm">
          <option value="7">7 Days</option>
          <option value="30">30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>

      <div className="bg-white p-4 rounded-[2rem] shadow-sm mb-6 h-48 flex items-center justify-center text-slate-300 italic">
        Heatmap View (Interactive)
      </div>

      <section className="bg-white p-6 rounded-[2.5rem] shadow-sm mb-4">
        <h3 className="font-bold text-slate-800 mb-4">Pain Hotspots</h3>
        <div className="space-y-3">
          {(expandPain ? areaStats : areaStats.slice(0, 3)).map((item) => (
            <div key={item.label} className="flex justify-between items-center">
              <span className="text-sm text-slate-600">{item.label}</span>
              <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold">{item.count} logs</span>
            </div>
          ))}
        </div>
        {areaStats.length > 3 && (
          <button type="button" onClick={() => setExpandPain(!expandPain)} className="w-full mt-4 pt-3 border-t text-[10px] font-black text-indigo-500 uppercase tracking-widest">
            {expandPain ? 'Show Less' : `+ View ${areaStats.length - 3} More`}
          </button>
        )}
      </section>

      <section className="bg-white p-6 rounded-[2.5rem] shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Top Triggers</h3>
        <div className="space-y-3">
          {(expandMcas ? triggerStats : triggerStats.slice(0, 3)).map((item) => (
            <div key={item.label} className="flex justify-between items-center">
              <span className="text-sm text-slate-600">{item.label}</span>
              <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold">{item.count} logs</span>
            </div>
          ))}
        </div>
        {triggerStats.length > 3 && (
          <button type="button" onClick={() => setExpandMcas(!expandMcas)} className="w-full mt-4 pt-3 border-t text-[10px] font-black text-indigo-500 uppercase tracking-widest">
            {expandMcas ? 'Show Less' : `+ View ${triggerStats.length - 3} More`}
          </button>
        )}
      </section>
    </div>
  )
}

export default AnalyticsPage
