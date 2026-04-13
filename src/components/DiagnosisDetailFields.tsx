import type { CSSProperties } from 'react'
import type { DiagnosisDirectoryStatus } from '../lib/diagnosisStatusOptions'
import { howOrWhyFieldLabel } from '../lib/diagnosisDirectoryRow'
import type { DiagnosisDirectoryDetailFields } from '../lib/diagnosisDirectoryRow'

type Patch = Partial<Pick<DiagnosisDirectoryDetailFields, 'how_or_why' | 'treatment_plan' | 'care_plan'>>

type Props = {
  status: DiagnosisDirectoryStatus
  how_or_why: string
  treatment_plan: string
  care_plan: string
  onChange: (patch: Patch) => void
  textAreaStyle?: CSSProperties
  labelClassName?: string
}

const DEFAULT_TX: CSSProperties = { width: '100%', fontSize: '0.88rem', lineHeight: 1.45, minWidth: 0 }

/**
 * Status-conditional fields for diagnosis directory rows: How/Why, and treatment + care for Confirmed only.
 */
export function DiagnosisDetailFields ({
  status,
  how_or_why,
  treatment_plan,
  care_plan,
  onChange,
  textAreaStyle = DEFAULT_TX,
  labelClassName,
}: Props) {
  const showTreatmentCare = status === 'Confirmed'
  return (
    <div style={{ display: 'grid', gap: 8, width: '100%' }}>
      <div className={labelClassName ? `form-group ${labelClassName}` : 'form-group'} style={{ margin: 0 }}>
        <label style={{ fontSize: '0.82rem' }}>{howOrWhyFieldLabel(status)}</label>
        <textarea
          value={how_or_why}
          onChange={(e) => onChange({ how_or_why: e.target.value })}
          placeholder={status === 'Confirmed' ? 'e.g. biopsy, specialist evaluation, imaging…' : 'Brief explanation…'}
          rows={2}
          style={textAreaStyle}
        />
      </div>
      {showTreatmentCare && (
        <>
          <div className={labelClassName ? `form-group ${labelClassName}` : 'form-group'} style={{ margin: 0 }}>
            <label style={{ fontSize: '0.82rem' }}>Treatment plan</label>
            <textarea
              value={treatment_plan}
              onChange={(e) => onChange({ treatment_plan: e.target.value })}
              placeholder="Medications, procedures, referrals…"
              rows={2}
              style={textAreaStyle}
            />
          </div>
          <div className={labelClassName ? `form-group ${labelClassName}` : 'form-group'} style={{ margin: 0 }}>
            <label style={{ fontSize: '0.82rem' }}>Care plan</label>
            <textarea
              value={care_plan}
              onChange={(e) => onChange({ care_plan: e.target.value })}
              placeholder="Self-care, monitoring, follow-up…"
              rows={2}
              style={textAreaStyle}
            />
          </div>
        </>
      )}
    </div>
  )
}
