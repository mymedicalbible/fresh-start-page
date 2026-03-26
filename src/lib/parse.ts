// Deterministic parsing helpers for charts/checklists.
// Goal: keep free typing fast while producing consistent “normalized” values for charts.

const PAIN_AREAS: { label: string; patterns: string[] }[] = [
  { label: 'Knees', patterns: ['knee'] },
  { label: 'Hips', patterns: ['hip'] },
  { label: 'Back', patterns: ['back', 'spine', 'lumbar', 'thoracic', 'lower back', 'mid back'] },
  { label: 'Neck', patterns: ['neck', 'cervical'] },
  { label: 'Head', patterns: ['head', 'headache'] },
  { label: 'Hands', patterns: ['hand', 'hands', 'wrist'] },
  { label: 'Feet', patterns: ['foot', 'feet', 'ankle', 'toe', 'toes'] },
  { label: 'Shoulders', patterns: ['shoulder'] },
]

export function titleCase (s: string) {
  const trimmed = s.trim()
  if (!trimmed) return ''
  return trimmed
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
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
  if (hits.length === 0) {
    // If the user typed a sentence but we can't classify, keep it grouped.
    return ['Other']
  }
  return [...new Set(hits)]
}

function splitBySeparators (text: string) {
  // Split on common “tag separators” but keep it forgiving for sentences.
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
    .flatMap((line) => {
      // If someone pastes “1) q / 2) q” on one line, split by numbering.
      // This is permissive; user can always edit later by re-logging.
      if (line.match(/^\d+[\).]\s+/)) return [line]
      if (line.match(/^[-•]\s+/)) return [line]
      return [line]
    })

  const cleaned = lines
    .map((l) => l.replace(/^(\d+[\).]\s+|[-•]\s+)\s*/g, '').trim())
    .filter((l) => l.length > 0)

  // If they didn’t use new lines, try splitting on “;” or “|”.
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

