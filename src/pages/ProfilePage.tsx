import { Link } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { fetchGameState, gameTokensEnabled } from '../lib/gameTokens'

const NOTIFY_KEYS = {
  appt: 'mb-profile-notify-appt',
  log: 'mb-profile-notify-log',
  streak: 'mb-profile-notify-streak',
} as const

function readNotify (key: string, defaultOn: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultOn
    return v === '1'
  } catch {
    return defaultOn
  }
}

function writeNotify (key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch { /* ignore */ }
}

function displayNameFromUser (user: User): string {
  const raw = user.user_metadata?.full_name
  if (typeof raw === 'string' && raw.trim()) {
    const first = raw.trim().split(/\s+/)[0]
    if (first) return first
  }
  const email = user.email ?? ''
  const local = email.split('@')[0] ?? ''
  if (local) {
    const bit = local.split(/[._-]/)[0] ?? local
    if (bit) return bit
  }
  return 'friend'
}

function memberSinceLabel (user: User): string {
  const c = user.created_at
  if (!c) return ''
  try {
    return new Date(c).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export function ProfilePage () {
  const { user, signOut } = useAuth()
  const email = user?.email ?? ''

  const [painCount, setPainCount] = useState<number | null>(null)
  const [episodeCount, setEpisodeCount] = useState<number | null>(null)
  const [visitCount, setVisitCount] = useState<number | null>(null)

  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const [nextPrice, setNextPrice] = useState(10)
  const [activePlushieName, setActivePlushieName] = useState<string | null>(null)
  const [ownedActive, setOwnedActive] = useState(false)
  const [tokensOff, setTokensOff] = useState(false)

  const [plushieSlots, setPlushieSlots] = useState<{ id: string; name: string; unlocked: boolean }[]>([])

  const [notifyAppt, setNotifyAppt] = useState(() => readNotify(NOTIFY_KEYS.appt, true))
  const [notifyLog, setNotifyLog] = useState(() => readNotify(NOTIFY_KEYS.log, true))
  const [notifyStreak, setNotifyStreak] = useState(() => readNotify(NOTIFY_KEYS.streak, false))

  const [accountBanner, setAccountBanner] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    if (!user) return
    const [p, e, v] = await Promise.all([
      supabase.from('pain_entries').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('mcas_episodes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('doctor_visits').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    setPainCount(p.count ?? 0)
    setEpisodeCount(e.count ?? 0)
    setVisitCount(v.count ?? 0)
  }, [user])

  const loadGameAndPlushies = useCallback(async () => {
    if (!user) return
    const [cat, un] = await Promise.all([
      supabase.from('plushie_catalog').select('id, name, slot_index').order('slot_index').limit(8),
      supabase.from('user_plushie_unlocks').select('plushie_id'),
    ])
    if (!cat.error) {
      const unlocked = new Set((un.data ?? []).map((r: { plushie_id: string }) => r.plushie_id))
      const rows = (cat.data ?? []) as { id: string; name: string; slot_index: number }[]
      setPlushieSlots(
        rows.slice(0, 5).map((r) => ({
          id: r.id,
          name: r.name,
          unlocked: unlocked.has(r.id),
        })),
      )
    }
    if (!gameTokensEnabled()) {
      setTokensOff(true)
      return
    }
    const state = await fetchGameState()
    if (!state.ok) {
      setTokensOff(true)
      return
    }
    setTokensOff(false)
    setTokenBalance(state.balance)
    setNextPrice(state.next_price)
    setActivePlushieName(state.active_plushie.name)
    setOwnedActive(state.owned_active)
  }, [user])

  useEffect(() => {
    void loadStats()
    void loadGameAndPlushies()
  }, [loadStats, loadGameAndPlushies])

  async function onChangePassword () {
    setAccountBanner(null)
    if (!email) {
      setAccountBanner('No email on this session.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/app`,
    })
    if (error) setAccountBanner(error.message)
    else setAccountBanner('Check your email for a password reset link.')
  }

  async function onChangeEmail () {
    setAccountBanner(null)
    const next = window.prompt('New email address', email)
    if (!next || !next.trim() || next.trim() === email) return
    const { error } = await supabase.auth.updateUser({ email: next.trim() })
    if (error) setAccountBanner(error.message)
    else setAccountBanner('If your project requires it, check both inboxes to confirm the new email.')
  }

  if (!user) return null

  const nameLower = displayNameFromUser(user).toLowerCase()
  const memberSince = memberSinceLabel(user)
  const needTokens = tokenBalance != null ? Math.max(0, nextPrice - tokenBalance) : 0
  const progressPct =
    tokenBalance != null && nextPrice > 0
      ? Math.min(100, Math.round((tokenBalance / nextPrice) * 100))
      : 0

  return (
    <div className="scrapbook-inner scrap-account-page">
      <div style={{ marginBottom: 10 }}>
        <BackButton fallbackTo="/app" label="back" className="scrap-back" />
      </div>

      {accountBanner && (
        <div className="scrap-account-banner" role="status">
          {accountBanner}
        </div>
      )}

      {/* Profile + tokens */}
      <section className="scrap-account-paper scrap-account-paper--hero">
        <span className="scrap-account-corner-tape scrap-account-corner-tape--tl" aria-hidden />
        <span className="scrap-account-corner-tape scrap-account-corner-tape--tr" aria-hidden />
        <span className="scrap-account-corner-tape scrap-account-corner-tape--bl" aria-hidden />
        <span className="scrap-account-corner-tape scrap-account-corner-tape--br" aria-hidden />
        <div className="scrap-account-profile-row">
          <div className="scrap-account-avatar" aria-hidden>
            🐼
          </div>
          <div className="scrap-account-profile-text">
            <div className="scrap-account-display-name">{nameLower}</div>
            <div className="scrap-account-email">{email || '—'}</div>
            {memberSince ? (
              <span className="scrap-account-badge">member since {memberSince}</span>
            ) : null}
          </div>
        </div>

        {!tokensOff && tokenBalance != null && (
          <div className="scrap-account-token-block">
            <div className="scrap-account-token-big">
              <span className="scrap-account-token-num">{tokenBalance}</span>
              <span className="scrap-account-token-label">tokens earned</span>
            </div>
            {!ownedActive && (
              <p className="scrap-account-token-hint">
                {needTokens} more to unlock next plushie
              </p>
            )}
            <div className="scrap-account-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="scrap-account-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="scrap-account-progress-meta">
              <span>{activePlushieName ? `${activePlushieName.toLowerCase()} ${ownedActive ? 'unlocked' : 'this week'}` : 'plushies'}</span>
              <span>
                {tokenBalance} / {nextPrice}
              </span>
            </div>
          </div>
        )}
        {tokensOff && (
          <p className="scrap-account-token-disabled">Token plushies are off in this build (set VITE_GAME_TOKENS_ENABLED=true to enable).</p>
        )}
      </section>

      {/* Stats */}
      <section className="scrap-account-block">
        <h2 className="scrap-account-heading">
          <span className="scrap-account-heading-bar scrap-account-heading-bar--mint" />
          your stats
        </h2>
        <div className="scrap-account-stat-grid">
          <div className="scrap-account-stat scrap-account-stat--pink scrap-account-tilt--a">
            <strong>{painCount === null ? '…' : painCount}</strong>
            <span>pain logs</span>
          </div>
          <div className="scrap-account-stat scrap-account-stat--mint scrap-account-tilt--b">
            <strong>{episodeCount === null ? '…' : episodeCount}</strong>
            <span>episodes</span>
          </div>
          <div className="scrap-account-stat scrap-account-stat--butter scrap-account-tilt--c">
            <strong>{visitCount === null ? '…' : visitCount}</strong>
            <span>visits</span>
          </div>
        </div>
      </section>

      {/* Plushies */}
      <section className="scrap-account-block">
        <h2 className="scrap-account-heading">
          <span className="scrap-account-heading-bar scrap-account-heading-bar--pink" />
          plushie collection
        </h2>
        <div className="scrap-account-paper scrap-account-paper--plushies">
          <span className="scrap-account-tape scrap-account-tape--sage" aria-hidden />
          <div className="scrap-account-plushie-row">
            {plushieSlots.length === 0
              ? (
                <p className="scrap-account-plushie-empty">
                  <Link to="/app/plushies">Open plushie shop</Link> to see the collection.
                </p>
                )
              : (
                  plushieSlots.map((p) => (
                    <Link
                      key={p.id}
                      to="/app/plushies"
                      className={`scrap-account-plushie-cell${p.unlocked ? ' scrap-account-plushie-cell--on' : ''}`}
                      title={p.name}
                    >
                      <span className="scrap-account-plushie-emoji" aria-hidden>
                        {p.unlocked ? '🧸' : '🔒'}
                      </span>
                      <span className="scrap-account-plushie-name">{p.name.slice(0, 8)}</span>
                    </Link>
                  ))
                )}
          </div>
        </div>
      </section>

      {/* Notifications (local prefs) */}
      <section className="scrap-account-block">
        <h2 className="scrap-account-heading">
          <span className="scrap-account-heading-bar scrap-account-heading-bar--lavender" />
          notifications
        </h2>
        <div className="scrap-account-paper scrap-account-paper--notify">
          <span className="scrap-account-tape scrap-account-tape--lavender" aria-hidden />
          <div className="scrap-account-notify-row">
            <div>
              <div className="scrap-account-notify-title">appointment reminders</div>
              <div className="scrap-account-notify-sub">1 hour before</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyAppt}
              className={`scrap-account-switch${notifyAppt ? ' is-on' : ''}`}
              onClick={() => {
                const n = !notifyAppt
                setNotifyAppt(n)
                writeNotify(NOTIFY_KEYS.appt, n)
              }}
            >
              {notifyAppt ? 'on' : 'off'}
            </button>
          </div>
          <div className="scrap-account-notify-row">
            <div>
              <div className="scrap-account-notify-title">daily log nudge</div>
              <div className="scrap-account-notify-sub">if no entry by 8pm</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyLog}
              className={`scrap-account-switch${notifyLog ? ' is-on' : ''}`}
              onClick={() => {
                const n = !notifyLog
                setNotifyLog(n)
                writeNotify(NOTIFY_KEYS.log, n)
              }}
            >
              {notifyLog ? 'on' : 'off'}
            </button>
          </div>
          <div className="scrap-account-notify-row">
            <div>
              <div className="scrap-account-notify-title">streak reminder</div>
              <div className="scrap-account-notify-sub">don&apos;t break the chain</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyStreak}
              className={`scrap-account-switch${notifyStreak ? ' is-on' : ''}`}
              onClick={() => {
                const n = !notifyStreak
                setNotifyStreak(n)
                writeNotify(NOTIFY_KEYS.streak, n)
              }}
            >
              {notifyStreak ? 'on' : 'off'}
            </button>
          </div>
          <p className="scrap-account-notify-footnote">These toggles are saved on this device only.</p>
        </div>
      </section>

      {/* Account actions */}
      <section className="scrap-account-block">
        <h2 className="scrap-account-heading">
          <span className="scrap-account-heading-bar scrap-account-heading-bar--tan" />
          account
        </h2>
        <div className="scrap-account-paper scrap-account-paper--actions">
          <span className="scrap-account-tape scrap-account-tape--tan" aria-hidden />
          <Link className="scrap-account-action-row" to="/app/records">
            <div>
              <div className="scrap-account-action-title">export my data</div>
              <div className="scrap-account-action-sub">PDF or CSV from records</div>
            </div>
            <span aria-hidden className="scrap-account-chevron">›</span>
          </Link>
          <button type="button" className="scrap-account-action-row scrap-account-action-row--btn" onClick={() => void onChangeEmail()}>
            <div>
              <div className="scrap-account-action-title">change email</div>
              <div className="scrap-account-action-sub">updates your sign-in email</div>
            </div>
            <span aria-hidden className="scrap-account-chevron">›</span>
          </button>
          <button type="button" className="scrap-account-action-row scrap-account-action-row--btn" onClick={() => void onChangePassword()}>
            <div>
              <div className="scrap-account-action-title">change password</div>
              <div className="scrap-account-action-sub">we&apos;ll email you a reset link</div>
            </div>
            <span aria-hidden className="scrap-account-chevron">›</span>
          </button>
        </div>
      </section>

      {/* Quick links (kept from original) */}
      <nav className="scrap-account-quick" aria-label="Shortcuts">
        <Link className="scrap-account-quick-link" to="/app/doctors">doctors</Link>
        <Link className="scrap-account-quick-link" to="/app/questions">questions</Link>
        <Link className="scrap-account-quick-link" to={`/app/visits?returnTo=${encodeURIComponent('/app/profile')}`}>visits</Link>
        <Link className="scrap-account-quick-link" to="/app?handoff=1">summary</Link>
      </nav>

      <button type="button" className="scrap-account-signout" onClick={() => signOut()}>
        sign out
      </button>
    </div>
  )
}
