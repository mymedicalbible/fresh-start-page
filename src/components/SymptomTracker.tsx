import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWeatherSnapshot } from '../lib/weatherSnapshot'
import { useAuth } from '../contexts/AuthContext'

export function SymptomTracker() {
  const { user } = useAuth()
  const [recentSymptoms, setRecentSymptoms] = useState<string[]>([])
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [activity, setActivity] = useState('')
  const [customSymptom, setCustomSymptom] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadPastSymptoms() {
      if (!user) return
      // Fetch unique symptoms from history to populate the pill buttons
      const { data } = await supabase
        .from('symptom_logs')
        .select('symptoms')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(25)
      
      if (data) {
        const flattened = data.flatMap(d => d.symptoms || [])
        const unique = Array.from(new Set(flattened))
        setRecentSymptoms(unique.slice(0, 15))
      }
    }
    loadPastSymptoms()
  }, [user])

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(s) ? prev.filter(item => item !== s) : [...prev, s]
    )
  }

  const handleSave = async () => {
    if (selectedSymptoms.length === 0 && !activity) return
    setLoading(true)

    const weatherSnapshot = await fetchWeatherSnapshot()
    const { error } = await supabase.from('symptom_logs').insert({
      user_id: user?.id,
      activity_last_4h: activity,
      symptoms: selectedSymptoms,
      logged_at: new Date().toISOString(),
      weather_snapshot: weatherSnapshot,
    })

    if (!error) {
      setActivity('')
      setSelectedSymptoms([])
      setCustomSymptom('')
      // Update local pill list with newly used symptoms
      const updated = Array.from(new Set([...selectedSymptoms, ...recentSymptoms]))
      setRecentSymptoms(updated.slice(0, 15))
    }
    setLoading(false)
  }

  return (
    <div className="card">
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Symptoms & activity tracker</h3>
        <p className="muted" style={{ fontSize: '0.8rem' }}>What were you doing in the last 4 hours?</p>
      </div>
      
      <div className="form-group">
        <textarea 
          className="input" 
          rows={2}
          value={activity} 
          onChange={(e) => setActivity(e.target.value)}
          placeholder="e.g. Just finished a workout, high stress at work, ate out..."
        />
      </div>

      <div className="form-group">
        <label>Current Symptoms</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', marginTop: '8px' }}>
          {recentSymptoms.map(s => (
            <button 
              key={s} 
              type="button"
              onClick={() => toggleSymptom(s)}
              style={{ 
                borderRadius: '20px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: selectedSymptoms.includes(s) ? 'var(--primary)' : 'transparent',
                color: selectedSymptoms.includes(s) ? 'white' : 'var(--text)',
                border: '1px solid var(--border)'
              }}
            >
              {s}
            </button>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            className="input" 
            value={customSymptom}
            onChange={(e) => setCustomSymptom(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customSymptom) { toggleSymptom(customSymptom); setCustomSymptom(''); }
                }
            }}
            placeholder="Other feature…"
          />
          <button 
            type="button" 
            className="btn" 
            onClick={() => {
              if (customSymptom) {
                toggleSymptom(customSymptom)
                setCustomSymptom('')
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      <button 
        className="btn btn-primary" 
        style={{ width: '100%', marginTop: '8px' }} 
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? 'Saving...' : 'Log Entry'}
      </button>
    </div>
  )
}