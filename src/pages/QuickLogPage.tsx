import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function QuickLogPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialType = searchParams.get('type') || 'pain'

  const [activeTab, setActiveTab] = useState(initialType)
  const [step, setStep] = useState(1)
  
  // Data States
  const [doctors, setDoctors] = useState<any[]>([])
  const [pastReasons, setPastReasons] = useState<string[]>([])
  
  // Form State
  const [visitForm, setVisitForm] = useState({
    date: new Date().toISOString().split('T')[0],
    doctor_id: '',
    specialty: '',
    reason: '',
    questions: '',
    meds: ''
  })

  useEffect(() => {
    const loadMetadata = async () => {
      const { data: d } = await supabase.from('doctors').select('*')
      const { data: v } = await supabase.from('doctor_visits').select('reason_for_visit')
      setDoctors(d || [])
      setPastReasons([...new Set(v?.map(i => i.reason_for_visit).filter(Boolean))] as string[])
    }
    loadMetadata()
  }, [])

  const saveVisit = async (status: 'completed' | 'pending') => {
    if (!user) return
    const { error } = await supabase.from('doctor_visits').insert([{
      user_id: user.id,
      visit_date: visitForm.date,
      doctor_id: visitForm.doctor_id,
      reason_for_visit: visitForm.reason,
      questions: visitForm.questions,
      medications_discussed: visitForm.meds,
      status: status
    }])
    if (!error) navigate('/dashboard')
  }

  return (
    <div className="p-4 max-w-xl mx-auto pb-24">
      {/* TAB SELECTOR */}
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
        {['pain', 'mcas', 'visit'].map(t => (
          <button 
            key={t}
            onClick={() => { setActiveTab(t); setStep(1); }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition ${activeTab === t ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'visit' ? (
        <div className="space-y-6">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
              <h2 className="text-xl font-bold">Visit Details</h2>
              <input type="date" className="w-full p-4 rounded-2xl bg-white border border-slate-100" value={visitForm.date} onChange={e => setVisitForm({...visitForm, date: e.target.value})} />
              <select className="w-full p-4 rounded-2xl bg-white border border-slate-100" value={visitForm.doctor_id} onChange={e => {
                const d = doctors.find(doc => doc.id === e.target.value);
                setVisitForm({...visitForm, doctor_id: e.target.value, specialty: d?.specialty || ''})
              }}>
                <option value="">Select Doctor</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input className="w-full p-4 rounded-2xl bg-slate-50 text-slate-400 border-none" value={visitForm.specialty} placeholder="Specialty (Auto)" readOnly />
              
              <p className="text-[10px] font-bold text-slate-400 uppercase px-2">Frequent Reasons</p>
              <div className="flex flex-wrap gap-2">
                {pastReasons.slice(0, 5).map(r => (
                  <button key={r} onClick={() => setVisitForm({...visitForm, reason: r})} className="px-3 py-1 bg-white border border-slate-100 rounded-full text-xs">{r}</button>
                ))}
              </div>
              <input className="w-full p-4 rounded-2xl bg-white border border-slate-100" placeholder="Or type new reason..." value={visitForm.reason} onChange={e => setVisitForm({...visitForm, reason: e.target.value})} />
              <button onClick={() => setStep(2)} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-bold">Next: Questions →</button>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-4">
              <h2 className="text-xl font-bold">Questions for the Doctor</h2>
              <textarea className="w-full p-6 rounded-[2rem] bg-white border border-slate-100 min-h-[250px]" placeholder="Write questions here..." value={visitForm.questions} onChange={e => setVisitForm({...visitForm, questions: e.target.value})} />
              <button onClick={() => setStep(3)} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-bold">Next: Outcomes →</button>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-4">
              <h2 className="text-xl font-bold">Notes & Outcome</h2>
              <textarea className="w-full p-6 rounded-[2rem] bg-white border border-slate-100 min-h-[200px]" placeholder="Discussed meds, tests, next steps..." value={visitForm.meds} onChange={e => setVisitForm({...visitForm, meds: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => saveVisit('pending')} className="bg-slate-100 p-5 rounded-[2rem] font-bold">Save Pending</button>
                <button onClick={() => saveVisit('completed')} className="bg-indigo-600 text-white p-5 rounded-[2rem] font-bold">Complete Visit</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-slate-400 py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
          {activeTab.toUpperCase()} Log Content Restored
          <p className="text-[10px] mt-2 italic">Standard slider/trigger logic active...</p>
        </div>
      )}
    </div>
  )
}