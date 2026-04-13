import type { DiagnosisDirectoryStatus } from './diagnosisStatusOptions'

/** Row shape for `diagnoses_directory` detail fields and visit/directory drafts. */
export type DiagnosisDirectoryDetailFields = {
  diagnosis: string
  status: DiagnosisDirectoryStatus
  how_or_why: string
  treatment_plan: string
  care_plan: string
}

export function emptyDiagnosisDraftRow (): DiagnosisDirectoryDetailFields {
  return {
    diagnosis: '',
    status: 'Suspected',
    how_or_why: '',
    treatment_plan: '',
    care_plan: '',
  }
}

export function normalizeDiagnosisDraftRow (
  partial: Partial<DiagnosisDirectoryDetailFields> & { diagnosis?: string; status?: DiagnosisDirectoryStatus },
): DiagnosisDirectoryDetailFields {
  return {
    diagnosis: partial.diagnosis ?? '',
    status: partial.status ?? 'Suspected',
    how_or_why: partial.how_or_why ?? '',
    treatment_plan: partial.treatment_plan ?? '',
    care_plan: partial.care_plan ?? '',
  }
}

/** UI label for the shared `how_or_why` column (Confirmed vs Suspected/Ruled out vs Resolved). */
export function howOrWhyFieldLabel (status: DiagnosisDirectoryStatus): string {
  if (status === 'Confirmed') return 'How were you diagnosed?'
  if (status === 'Resolved') return 'Context'
  return 'Why?'
}

export function dbNullable (s: string): string | null {
  const t = s.trim()
  return t ? t : null
}

function preferLastNonEmpty (prev: string, next: string): string {
  const t = next.trim()
  if (t) return next
  return prev
}

/**
 * Last row wins for `status` and diagnosis casing; text fields merge by last non-empty value.
 */
export function dedupeDiagnosisRows<T extends DiagnosisDirectoryDetailFields> (rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const r of rows) {
    const name = r.diagnosis.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const prev = map.get(key) as T | undefined
    if (!prev) {
      map.set(key, { ...r, diagnosis: name } as T)
    } else {
      map.set(key, {
        ...prev,
        diagnosis: name,
        status: r.status,
        how_or_why: preferLastNonEmpty(prev.how_or_why, r.how_or_why),
        treatment_plan: preferLastNonEmpty(prev.treatment_plan, r.treatment_plan),
        care_plan: preferLastNonEmpty(prev.care_plan, r.care_plan),
      } as T)
    }
  }
  return [...map.values()]
}

/** When saving: only persist treatment/care for Confirmed; clear hidden fields. */
export function diagnosisDetailFieldsForStatus (
  status: DiagnosisDirectoryStatus,
  fields: Pick<DiagnosisDirectoryDetailFields, 'how_or_why' | 'treatment_plan' | 'care_plan'>,
): { how_or_why: string | null; treatment_plan: string | null; care_plan: string | null } {
  const how = dbNullable(fields.how_or_why)
  if (status === 'Confirmed') {
    return {
      how_or_why: how,
      treatment_plan: dbNullable(fields.treatment_plan),
      care_plan: dbNullable(fields.care_plan),
    }
  }
  return {
    how_or_why: how,
    treatment_plan: null,
    care_plan: null,
  }
}
