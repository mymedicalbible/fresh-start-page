export type PainSide = 'left' | 'right' | 'both'

export type PainAreaSelection = {
  area: string
  side: PainSide
}

export const PAIN_AREA_LIST = [
  'Knee', 'Hip', 'Shoulder', 'Ankle', 'Foot', 'Hand', 'Wrist',
  'Elbow', 'Arm', 'Thigh', 'Calf', 'Shin', 'Eye', 'Ear',
]

export const MIDLINE_AREA_LIST = [
  'Back', 'Neck', 'Head', 'Chest', 'Abdomen', 'Jaw', 'Spine',
]

export function painSelectionsToString (selections: PainAreaSelection[]): string {
  return selections.map((s) => {
    if (MIDLINE_AREA_LIST.includes(s.area)) return s.area
    if (s.side === 'both') return `Left & Right ${s.area}`
    return `${s.side === 'left' ? 'Left' : 'Right'} ${s.area}`
  }).join(', ')
}

export function parsePainAreas (locationText: string): string[] {
  if (!locationText) return []
  return locationText.split(',').map((p) => p.trim()).filter(Boolean)
}

export function titleCase (s: string) {
  const trimmed = s.trim()
  if (!trimmed) return ''
  return trimmed.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
}

function splitBySeparators (text: string) {
  return (text ?? '')
    .split(/[\n,;•|&/]+|\band\b|\bor\b/gi)
    .map((x) => x.trim())
    .filter(Boolean)
}

function normalizeToken (tok: string) {
  const t = tok.trim()
  if (!t) return ''
  return titleCase(t)
}

export function parseTriggerTokens (triggerText: string): string[] {
  const tokens = splitBySeparators(triggerText)
  if (tokens.length === 0) return []
  const mapped = tokens.map((t) => t.trim()).filter(Boolean).map((t) => {
    const lt = t.toLowerCase()
    if (lt.includes('food') || lt.includes('meal')) return 'Food'
    if (lt.includes('stress') || lt.includes('anx')) return 'Stress'
    if (lt.includes('weather') || lt.includes('temperature') || lt.includes('cold') || lt.includes('heat')) return 'Weather/Temperature'
    if (lt.includes('exercise') || lt.includes('workout') || lt.includes('walking')) return 'Exercise'
    if (lt.includes('sleep') || lt.includes('insomnia')) return 'Sleep'
    if (lt.includes('infection') || lt.includes('sick')) return 'Infection'
    return normalizeToken(t)
  })
  return [...new Set(mapped)].filter(Boolean)
}

export function parseSideEffectTokens (sideEffectsText: string): string[] {
  const tokens = splitBySeparators(sideEffectsText)
  return [...new Set(tokens.map((t) => normalizeToken(t)).filter(Boolean))]
}

export function splitQuestionsIntoRows (raw: string): string[] {
  const text = (raw ?? '').replace(/\r\n/g, '\n')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const cleaned = lines
    .map((l) => l.replace(/^(\d+[\).]\s+|[-•]\s+)\s*/g, '').trim())
    .filter((l) => l.length > 0)
  if (cleaned.length <= 1) {
    const alt = splitBySeparators(raw).map((s) => s.trim()).filter((s) => s.length > 0)
    return alt.length > 0 ? alt : cleaned
  }
  return cleaned
}

export function splitTestsIntoItems (raw: string): string[] {
  const tokens = (raw ?? '').replace(/\r\n/g, '\n').split('\n')
    .map((l) => l.replace(/^(\d+[\).]\s+|[-•]\s+)/g, '').trim()).filter(Boolean)
  if (tokens.length <= 1) {
    return splitBySeparators(raw).map((t) => normalizeToken(t)).filter(Boolean)
  }
  return tokens.map((t) => normalizeToken(t)).filter(Boolean)
}