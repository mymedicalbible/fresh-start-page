import { useEffect, useState } from 'react'

type Doctor = { id: string; name: string; specialty?: string | null }

type Props = {
  doctors: Doctor[]
  value: string
  onChange: (doctorName: string) => void
  /** When adding a new doctor, optional specialty (requires onSpecialtyChange + showSpecialtyForNew) */
  specialty?: string
  onSpecialtyChange?: (specialty: string) => void
  showSpecialtyForNew?: boolean
  label?: string
  id?: string
}

/**
 * Pick an existing doctor or type a new name (stored as plain text on the parent record).
 */
export function DoctorPickOrNew ({
  doctors,
  value,
  onChange,
  specialty = '',
  onSpecialtyChange,
  showSpecialtyForNew = false,
  label = 'Doctor',
  id = 'doc-pick',
}: Props) {
  const [mode, setMode] = useState<'pick' | 'new'>('pick')

  useEffect(() => {
    if (!value) {
      setMode('pick')
      return
    }
    const inList = doctors.some((d) => d.name === value)
    setMode(inList ? 'pick' : 'new')
  }, [value, doctors])

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${mode === 'pick' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          onClick={() => {
            setMode('pick')
            if (!doctors.some((d) => d.name === value)) onChange('')
            onSpecialtyChange?.('')
          }}
        >
          From list
        </button>
        <button
          type="button"
          className={`btn ${mode === 'new' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          onClick={() => setMode('new')}
        >
          New doctor
        </button>
      </div>
      {mode === 'pick' ? (
        <select
          id={id}
          value={doctors.some((d) => d.name === value) ? value : ''}
          onChange={(e) => {
            onChange(e.target.value)
            const doc = doctors.find((d) => d.name === e.target.value)
            onSpecialtyChange?.(doc?.specialty?.trim() ? doc.specialty : '')
          }}
        >
          <option value="">— Optional / not set —</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type doctor name (saved on this record)"
          />
          {showSpecialtyForNew && onSpecialtyChange && (
            <input
              id={`${id}-specialty`}
              value={specialty}
              onChange={(e) => onSpecialtyChange(e.target.value)}
              placeholder="Specialty (optional)"
              style={{ marginTop: 8 }}
            />
          )}
        </>
      )}
    </div>
  )
}
