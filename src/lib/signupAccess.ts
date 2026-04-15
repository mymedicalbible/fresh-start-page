function parseCsv (value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeEmail (email: string): string {
  return email.trim().toLowerCase()
}

export function isSignupInviteOnlyEnabled (): boolean {
  return import.meta.env.VITE_INVITE_ONLY_SIGNUP === 'true'
}

export function canEmailSelfRegister (email: string): boolean {
  if (!isSignupInviteOnlyEnabled()) return true
  const normalized = normalizeEmail(email)
  if (!normalized.includes('@')) return false

  const allowedEmails = new Set(parseCsv(import.meta.env.VITE_SIGNUP_ALLOWLIST_EMAILS))
  const allowedDomains = new Set(parseCsv(import.meta.env.VITE_SIGNUP_ALLOWLIST_DOMAINS))
  const domain = normalized.split('@')[1] ?? ''

  return allowedEmails.has(normalized) || (domain.length > 0 && allowedDomains.has(domain))
}
