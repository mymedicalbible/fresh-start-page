import { useEffect, useState } from 'react'
import { normDoctorKey } from '../lib/doctorNameNorm'

type Doctor = { id: string; name: string; specialty?: string | null }

function findDoctorInList (doctors: Doctor[], value: string): Doctor | undefined {
  if (!value.trim()) return undefined
  const key = normDoctorKey(value)
  return doctors.find((d) => normDoctorKey(d.name) === key)
}

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
  /** When true, empty select shows “Pick a doctor” instead of “optional”. */
  doctorRequired?: boolean
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
  doctorRequired = false,
}: Props) {
  const [mode, setMode] = useState<'pick' | 'new'>('pick')

  useEffect(() => {
    if (!value.trim()) {
      setMode('pick')
      return
    }
    const doc = findDoctorInList(doctors, value)
    setMode(doc ? 'pick' : 'new')
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
            if (!findDoctorInList(doctors, value)) onChange('')
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
        <>
          <select
            id={id}
            aria-required={doctorRequired}
            value={findDoctorInList(doctors, value)?.name ?? ''}
            style={{ touchAction: 'manipulation' }}
            onChange={(e) => {
              const v = e.target.value
              onChange(v)
              const doc = findDoctorInList(doctors, v)
              onSpecialtyChange?.(doc?.specialty?.trim() ? doc.specialty : '')
            }}
          >
            <option value="">{doctorRequired ? '— Pick a doctor —' : '— Optional / not set —'}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '8px 0 0', lineHeight: 1.4 }}>
            Specialty:{' '}
            <strong style={{ fontWeight: 600, color: 'var(--text, #334155)' }}>
              {findDoctorInList(doctors, value)?.specialty?.trim() || '—'}
            </strong>
          </p>
        </>
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
