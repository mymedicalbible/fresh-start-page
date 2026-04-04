import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)

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

  const generateSummary = async () => {
    setIsGenerating(true)
    try {
      // Background fetch of Pain/MCAS spikes
      const { data: pain } = await supabase.from('pain_entries').select('*').order('entry_date', { ascending: false }).limit(5)
      const { data: mcas } = await supabase.from('mcas_entries').select('*').order('episode_date', { ascending: false }).limit(5)
      
      const summary = `Health Summary: ${new Date().toLocaleDateString()}\nPain Spikes: ${pain?.map(p => p.location).join(', ')}\nMCAS Triggers: ${mcas?.map(m => m.trigger).join(', ')}`
      
      await navigator.clipboard.writeText(summary)
      alert("Summary generated and copied to clipboard!")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      {/* COMPACT NAV BUTTONS */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <button onClick={() => navigate('/log?type=pain')} className="flex flex-col items-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 transition active:scale-95">
          <span className="text-xl mb-1">🔥</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pain</span>
        </button>
        <button onClick={() => navigate('/log?type=mcas')} className="flex flex-col items-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 transition active:scale-95">
          <span className="text-xl mb-1">🛡️</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">MCAS</span>
        </button>
        <button onClick={() => navigate('/log?type=visit')} className="flex flex-col items-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 transition active:scale-95">
          <span className="text-xl mb-1">🩺</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Visit</span>
        </button>
        <button onClick={() => navigate('/questions')} className="flex flex-col items-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 transition active:scale-95">
          <span className="text-xl mb-1">❓</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ask</span>
        </button>
      </div>

      {/* GENERATE SUMMARY - REPLACES RECORDS */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[32px] p-6 text-white mb-6 shadow-lg shadow-indigo-200">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold">Health Snapshot</h2>
          <button 
            onClick={generateSummary}
            className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-full text-sm font-semibold hover:bg-white/30 transition"
          >
            {isGenerating ? "Processing..." : "Generate Summary"}
          </button>
        </div>
        <p className="text-indigo-100 text-xs">Ready for your next appointment?</p>
      </div>

      {/* PENDING BADGE */}
      {pendingCount > 0 && (
        <button 
          onClick={() => navigate('/visits?tab=pending')}
          className="w-full mb-6 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex justify-between items-center animate-pulse"
        >
          <span className="text-amber-800 text-sm font-medium">You have {pendingCount} visits to finish logging</span>
          <span className="text-amber-600 text-xs font-bold">COMPLETE →</span>
        </button>
      )}
    </div>
  )
}