const PAIN_AREAS: { label: string; patterns: string[] }[] = [
  { label: 'Knees', patterns: ['knee', 'knees'] },
  { label: 'Hips', patterns: ['hip', 'hips'] },
  { label: 'Back', patterns: ['back', 'spine', 'lumbar', 'thoracic', 'lower back', 'mid back'] },
  { label: 'Neck', patterns: ['neck', 'cervical'] },
  { label: 'Head', patterns: ['head', 'headache', 'migraine'] },
  { label: 'Hands', patterns: ['hand', 'hands', 'wrist', 'wrists', 'finger', 'fingers'] },
  { label: 'Feet', patterns: ['foot', 'feet', 'ankle', 'ankles', 'toe', 'toes', 'heel'] },
  { label: 'Shoulders', patterns: ['shoulder', 'shoulders'] },
  { label: 'Thighs', patterns: ['thigh', 'thighs', 'quad', 'quads', 'hamstring'] },
  { label: 'Calves', patterns: ['calf', 'calves', 'shin', 'shins'] },
  { label: 'Chest', patterns: ['chest', 'sternum', 'rib', 'ribs'] },
  { label: 'Abdomen', patterns: ['abdomen', 'stomach', 'belly', 'abdominal', 'gut'] },
  { label: 'Arms', patterns: ['arm', 'arms', 'elbow', 'elbows', 'forearm', 'bicep'] },
  { label: 'Jaw', patterns: ['jaw', 'tmj', 'teeth', 'mouth'] },
  { label: 'Eyes', patterns: ['eye', 'eyes', 'vision'] },
]

export function titleCase (s: string) {
  const trimmed = s.trim()
  if (!trimmed) return ''
  return trimmed.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
}

function normalizeText (s: string) {
  return (s ?? '').toLowerCase()
}

export function parsePainAreas (locationText: string): string[] {
  const t = normalizeText(locationText)
  const hits: string[] = []
  for (const area of PAIN_AREAS) {
    const matched = area.patterns.some((p) => t.includes(p))
    if (matched) hits.push(area.label)
  }
  // If we matched something, return it; otherwise keep the raw text grouped as Other
  if (hits.length === 0 && t.trim().length > 0) return ['Other']
  if (hits.length === 0) return []
  return [...new Set(hits)]
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
  const mapped = tokens
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
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
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
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
  const tokens = (raw ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^(\d+[\).]\s+|[-•]\s+)/g, '').trim())
    .filter(Boolean)
  if (tokens.length <= 1) {
    return splitBySeparators(raw).map((t) => normalizeToken(t)).filter(Boolean)
  }
  return tokens.map((t) => normalizeToken(t)).filter(Boolean)
}