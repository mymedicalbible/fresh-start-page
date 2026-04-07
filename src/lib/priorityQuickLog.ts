import type { CSSProperties } from 'react'

/** Same palette as visit Questions step priority buttons (Low / Medium / High). */

export function priorityTackFill (p: string | null): string {
  const x = (p || 'Medium').trim().toLowerCase()
  if (x === 'high') return '#ef4444'
  if (x === 'low') return '#22c55e'
  return '#eab308'
}

export function priorityLabelColor (p: string | null): string {
  const x = (p || 'Medium').trim().toLowerCase()
  if (x === 'high') return '#991b1b'
  if (x === 'low') return '#065f46'
  return '#92400e'
}

export function priorityButtonStyles (p: 'High' | 'Medium' | 'Low', active: boolean): CSSProperties {
  const base: CSSProperties = {
    flex: 1,
    fontSize: '0.82rem',
    fontWeight: 600,
    borderWidth: 2,
    borderStyle: 'solid',
  }
  if (p === 'Low') {
    return {
      ...base,
      borderColor: active ? '#22c55e' : '#bbf7d0',
      background: active ? '#d1fae5' : '#f7fee7',
      color: active ? '#065f46' : '#64748b',
    }
  }
  if (p === 'Medium') {
    return {
      ...base,
      borderColor: active ? '#eab308' : '#fde68a',
      background: active ? '#fef3c7' : '#fffbeb',
      color: active ? '#92400e' : '#64748b',
    }
  }
  return {
    ...base,
    borderColor: active ? '#ef4444' : '#fecaca',
    background: active ? '#fee2e2' : '#fef2f2',
    color: active ? '#991b1b' : '#64748b',
  }
}
