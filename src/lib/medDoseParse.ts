/** Split wizard combined line ("dose · frequency") into DB columns. */
export function splitDoseFrequencyFromCombined (combined: string): { dose: string | null; frequency: string | null } {
  const c = combined.trim()
  if (!c) return { dose: null, frequency: null }
  const parts = c.split(/\s*·\s*/)
  if (parts.length === 1) return { dose: parts[0] || null, frequency: null }
  return { dose: parts[0] || null, frequency: parts.slice(1).join(' · ') || null }
}
