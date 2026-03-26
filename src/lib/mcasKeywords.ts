const MCAS_KEYWORDS = [
  'hives',
  'rash',
  'itching',
  'swelling',
  'flushing',
  'anaphylaxis',
  'throat',
  'breathing',
]

export function reactionLooksLikeMcas (reactionText: string) {
  const t = reactionText.toLowerCase()
  return MCAS_KEYWORDS.some((k) => t.includes(k))
}
