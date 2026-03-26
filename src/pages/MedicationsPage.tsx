import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type MedRow = {
  id: string
  medication: string
  dose: string | null
  frequency: string | null
  start_date: string | null
  purpose: string | null
  effectiveness: string | null
  side_effects: string | null
  notes: string | null
}

export function MedicationsPage () {
  const { user } = useAuth()
  const [rows, setRows] = useState<MedRow[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load () {
    if (!user) return
    const { data, error: e } = await supabase
      .from('current_medications')
      .select('*')
      .eq('user_id', user.id)
      .order('medication', { ascending: true })
    if (e) setError(e.message)
    else setRows((data ?? []) as MedRow[])
  }

  useEffect(() => {
    load()
  }, [user])

  if (!user) return null

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Current medications</h2>
        <p className="muted">Data comes from the Quick Log → “Update medication list” flow (same medication name updates the row).</p>
        {rows.length === 0
          ? (
            <p className="muted">No medications yet. Add one from the Log tab.</p>
            )
          : (
            <div style={{ display: 'grid', gap: 12 }}>
              {rows.map((m) => (
                <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fff' }}>
                  <div style={{ fontWeight: 700 }}>{m.medication}</div>
                  <div className="muted" style={{ fontSize: '0.88rem', marginTop: 6 }}>
                    {[m.dose, m.frequency].filter(Boolean).join(' · ') || '—'}
                    <br />
                    {m.purpose ? `Purpose: ${m.purpose}` : ''}
                    {m.effectiveness ? (
                      <>
                        <br />
                        Effectiveness: {m.effectiveness}
                      </>
                    ) : null}
                    {m.side_effects ? (
                      <>
                        <br />
                        Side effects: {m.side_effects}
                      </>
                    ) : null}
                    {m.notes ? (
                      <>
                        <br />
                        Notes: {m.notes}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            )}
      </div>
    </div>
  )
}
