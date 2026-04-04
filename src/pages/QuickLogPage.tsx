import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

interface Doctor {
  id: string;
  name: string;
  specialty: string;
}

export default function QuickLogPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [pastReasons, setPastReasons] = useState<string[]>([])
  
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    doctor_id: '',
    specialty: '',
    reason: '',
    questions: '',
    meds: '',
  })

  useEffect(() => {
    const loadData = async () => {
      const { data: dDocs } = await supabase.from('doctors').select('*')
      const { data: dVisits } = await supabase.from('doctor_visits').select('reason_for_visit')
      
      if (dDocs) setDoctors(dDocs as Doctor[])
      if (dVisits) {
        const reasons = [...new Set(dVisits.map(v => v.reason_for_visit).filter(Boolean))] as string[]
        setPastReasons(reasons)
      }
    }
    loadData()
  }, [])

  const handleDoctorChange = (id: string) => {
    const doc = doctors.find(d => d.id === id)
    setForm({ ...form, doctor_id: id, specialty: doc?.specialty || '' })
  }

  const saveVisit = async (status: 'completed' | 'pending') => {
    if (!user) return;
    const { error } = await supabase.from('doctor_visits').insert([{
      user_id: user.id,
      visit_date: form.date,
      doctor_id: form.doctor_id,
      reason_for_visit: form.reason,
      questions: form.questions,
      medications_discussed: form.meds,
      status: status
    }])
    if (!error) navigate('/dashboard')
  }

  return (
    <div className="p-4 max-w-md mx-auto min-h-screen pb-20">
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <h1 className="text-2xl font-bold text-slate-800">Visit Details</h1>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Date of Appt</label>
              <input type="date" className="w-full p-4 rounded-3xl bg-slate-100 border-none mt-1" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Select Doctor</label>
              <select className="w-full p-4 rounded-3xl bg-slate-100 border-none mt-1" value={form.doctor_id} onChange={e => handleDoctorChange(e.target.value)}>
                <option value="">Choose a Provider...</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Specialty</label>
              <input className="w-full p-4 rounded-3xl bg-slate-200 border-none mt-1 text-slate-500" value={form.specialty} readOnly />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Reason for Visit</label>
              <div className="flex flex-wrap gap-2 mb-3 mt-1">
                {pastReasons.slice(0, 4).map(r => (
                  <button key={r} onClick={() => setForm({...form, reason: r})} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold transition active:scale-90">{r}</button>
                ))}
              </div>
              <input className="w-full p-4 rounded-3xl bg-slate-100 border-none" placeholder="Or type reason..." value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} />
            </div>
          </div>
          <button onClick={() => setStep(2)} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-bold shadow-lg shadow-indigo-100 transition active:scale-95">Next: Questions →</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          <h1 className="text-2xl font-bold text-slate-800">Any Questions?</h1>
          <textarea className="w-full p-6 rounded-[2rem] bg-slate-100 border-none min-h-[300px] text-lg" placeholder="What do you need to ask during the visit?" value={form.questions} onChange={e => setForm({...form, questions: e.target.value})} />
          <button onClick={() => setStep(3)} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-bold shadow-lg shadow-indigo-100 transition active:scale-95">Next: Outcome →</button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          <h1 className="text-2xl font-bold text-slate-800">Visit Results</h1>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
             <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">Meds, Tests, & Notes</label>
             <textarea className="w-full p-4 rounded-2xl bg-slate-50 border-none min-h-[150px]" placeholder="Note down changes..." value={form.meds} onChange={e => setForm({...form, meds: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => saveVisit('pending')} className="bg-slate-100 text-slate-600 p-5 rounded-[2rem] font-bold transition active:scale-95">Save Pending</button>
            <button onClick={() => saveVisit('completed')} className="bg-indigo-600 text-white p-5 rounded-[2rem] font-bold shadow-lg shadow-indigo-100 transition active:scale-95">Finish Log</button>
          </div>
        </div>
      )}
    </div>
  )
}