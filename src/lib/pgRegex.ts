/**
 * Escape a string for use as a literal segment inside PostgreSQL POSIX regex (~ / ~*).
 * @see https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-POSIX-REGEXP
 */
export function escapePostgresRegexLiteral (s: string): string {
  return s.replace(/[\\.^$*+?()[\]{}|]/g, '\\$&')
}

/** Case-insensitive substring match on a text column (replaces fragile ILIKE "%…%" with user names containing % or _). */
export function doctorFieldContainsRegex (doctorName: string): string {
  const lit = escapePostgresRegexLiteral(doctorName.trim())
  return `.*${lit}.*`
}

/** Notes prefix used on current_medications for doctor-specific prescribing. */
export function prescribedByNotesRegex (doctorName: string): string {
  return `^Prescribed by: ${escapePostgresRegexLiteral(doctorName.trim())}`
}
