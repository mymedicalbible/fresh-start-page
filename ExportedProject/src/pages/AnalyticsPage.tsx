import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function AnalyticsPage() {
  const { user } = useAuth()
  const [days, setDays] = useState(30)
  const [topSymptoms, setTopSymptoms] = useState<{name: string, count: number}[]>([])
  const [heatMap, setHeatMap] = useState<{hour: number, intensity: number}[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalytics() {
      if (!user) return
      setLoading(true)
      
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data: logs } = await supabase
        .from('symptom_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_at', startDate.toISOString())

      if (logs) {
        // 1. Calculate Top Symptoms
        const counts: Record<string, number> = {}
        logs.forEach(log => {
          log.symptoms?.forEach((s: string) => {
            counts[s] = (counts[s] || 0) + 1
          })
        })
        const sorted = Object.entries(counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
        setTopSymptoms(sorted)

        // 2. Calculate Hourly Heat Map
        const hourly: Record<number, number> = {}
        for (let i = 0; i < 24; i++) hourly[i] = 0
        
        logs.forEach(log => {
          const hour = new Date(log.logged_at).getHours()
          hourly[hour] += (log.symptoms?.length || 0)
        })

        setHeatMap(Object.entries(hourly).map(([h, i]) => ({ hour: parseInt(h), intensity: i })))
      }
      setLoading(false)
    }

    fetchAnalytics()
  }, [user, days])

  if (loading) return <div className="container">Loading Health Trends...</div>

  const maxIntensity = Math.max(...heatMap.map(h => h.intensity), 1)

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Health Analytics</h2>
        <select className="input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div className="card">
          <h3>Top Symptoms</h3>
          <div style={{ marginTop: '16px' }}>
            {topSymptoms.length === 0 && <p className="muted">No symptoms recorded in this timeframe.</p>}
            {topSymptoms.map(s => (
              <div key={s.name} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{s.name}</span>
                  <span className="muted">{s.count} logs</span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    background: 'var(--primary)', 
                    width: `${(s.count / topSymptoms[0].count) * 100}%` 
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Symptom Frequency by Hour</h3>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '16px' }}>Aggregated intensity of symptoms throughout the day.</p>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(6, 1fr)', 
            gap: '8px',
            textAlign: 'center'
          }}>
            {heatMap.map(h => (
              <div key={h.hour} style={{ 
                padding: '10px 4px', 
                borderRadius: '6px', 
                background: `rgba(99, 102, 241, ${0.1 + (h.intensity / maxIntensity) * 0.9})`, 
                border: '1px solid var(--border)',
                color: (h.intensity / maxIntensity) > 0.5 ? 'white' : 'var(--text)'
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>{h.hour}:00</div>
                <div style={{ fontSize: '0.9rem' }}>{h.intensity}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.75rem' }} className="muted">
            <span>Midnight</span>
            <span>Noon</span>
            <span>Night</span>
          </div>
        </div>
      </div>
    </div>
  )
}