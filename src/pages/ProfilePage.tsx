import { Link, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import Lottie from 'lottie-react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { fetchGameState, gameTokensEnabled } from '../lib/gameTokens'
import { useGameStateRefresh } from '../lib/useGameStateRefresh'
import { runExportDownload } from '../lib/fullDataExport'
import {
  clearManualWeatherLocation,
  getManualWeatherLocation,
  getWeatherLocationMode,
  searchPlaces,
  setManualWeatherLocation,
  setWeatherLocationMode,
  type ManualWeatherLocation,
  type WeatherLocationMode,
} from '../lib/weatherLocationSettings'

function PandaLottieLoop ({ data, className }: { data: object; className?: string }) {
  return (
    <Lottie
      className={className}
      animationData={data}
      loop
      rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
    />
  )
}

const NOTIFY_KEYS = {
  appt: 'mb-profile-notify-appt',
  log: 'mb-profile-notify-log',
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
  const { pathname: profilePath } = useLocation()
  const email = user?.email ?? ''

  const [painCount, setPainCount] = useState<number | null>(null)
  const [episodeCount, setEpisodeCount] = useState<number | null>(null)
  const [visitCount, setVisitCount] = useState<number | null>(null)

  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const [nextPrice, setNextPrice] = useState(10)
  const [ownedActive, setOwnedActive] = useState(false)
  const [tokensOff, setTokensOff] = useState(false)

  const [plushieSlots, setPlushieSlots] = useState<{ id: string; name: string; unlocked: boolean }[]>([])

  const [notifyAppt, setNotifyAppt] = useState(() => readNotify(NOTIFY_KEYS.appt, true))
  const [notifyLog, setNotifyLog] = useState(() => readNotify(NOTIFY_KEYS.log, true))

  const [weatherLocMode, setWeatherLocMode] = useState<WeatherLocationMode>(() => getWeatherLocationMode())
  const [manualWeather, setManualWeather] = useState<ManualWeatherLocation | null>(() => getManualWeatherLocation())
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<{ lat: number; lng: number; label: string }[]>([])
  const [placeBusy, setPlaceBusy] = useState(false)

  const [accountBanner, setAccountBanner] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [pandaLottieData, setPandaLottieData] = useState<object | null>(null)
  const [activePlushieLottiePath, setActivePlushieLottiePath] = useState<string | null>(null)

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
      supabase.from('plushie_catalog').select('id, name, slot_index, slug').order('slot_index').limit(12),
      supabase.from('user_plushie_unlocks').select('plushie_id'),
    ])
    if (!cat.error) {
      const unlocked = new Set((un.data ?? []).map((r: { plushie_id: string }) => r.plushie_id))
      const rows = (cat.data ?? []) as { id: string; name: string; slot_index: number; slug?: string }[]
      const withoutPanda = rows.filter((r) => (r.slug ?? '') !== 'panda-popcorn')
      setPlushieSlots(
        withoutPanda.slice(0, 5).map((r) => ({
          id: r.id,
          name: r.name,
          unlocked: unlocked.has(r.id),
        })),
      )
    }
    if (!gameTokensEnabled()) {
      setTokensOff(true)
      setActivePlushieLottiePath(null)
      setPandaLottieData(null)
      return
    }
    const state = await fetchGameState()
    if (!state.ok) {
      setTokensOff(true)
      setActivePlushieLottiePath(null)
      setPandaLottieData(null)
      return
    }
    setTokensOff(false)
    setTokenBalance(state.balance)
    setNextPrice(state.next_price)
    setOwnedActive(state.owned_active)
    setActivePlushieLottiePath(state.active_plushie?.lottie_path ?? null)
  }, [user])

  useGameStateRefresh(!!user && gameTokensEnabled(), () => {
    void loadGameAndPlushies()
  })

  useEffect(() => {
    void loadStats()
    void loadGameAndPlushies()
  }, [loadStats, loadGameAndPlushies, profilePath])

  useEffect(() => {
    setWeatherLocMode(getWeatherLocationMode())
    setManualWeather(getManualWeatherLocation())
  }, [profilePath])

  useEffect(() => {
    if (!ownedActive || !activePlushieLottiePath) {
      setPandaLottieData(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(activePlushieLottiePath)
        if (res.ok && !cancelled) {
          setPandaLottieData(await res.json() as object)
        } else if (!cancelled) {
          setPandaLottieData(null)
        }
      } catch {
        if (!cancelled) setPandaLottieData(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ownedActive, activePlushieLottiePath])

  useEffect(() => {
    const q = placeQuery.trim()
    if (q.length < 2) {
      setPlaceResults([])
      setPlaceBusy(false)
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      setPlaceBusy(true)
      void searchPlaces(q).then((rows) => {
        if (!cancelled) {
          setPlaceResults(rows)
          setPlaceBusy(false)
        }
      })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [placeQuery])

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

  async function confirmExport (format: 'json' | 'pdf') {
    if (!user || exportBusy) return
    setExportBusy(true)
    setAccountBanner(null)
    setExportDialogOpen(false)
    try {
      await runExportDownload(user.id, format)
    } catch (e) {
      setAccountBanner(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExportBusy(false)
    }
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
        <div className="scrap-account-profile-row">
          <div className="scrap-account-avatar" aria-hidden>
            {pandaLottieData ? (
              <PandaLottieLoop data={pandaLottieData} className="scrap-account-avatar-lottie" />
            ) : (
              <span aria-hidden>🐼</span>
            )}
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
              <span>plushies</span>
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
            {pandaLottieData ? (
              <div className="scrap-account-plushie-cell scrap-account-plushie-cell--panda-still" title="panda">
                <div className="scrap-account-plushie-panda-static">
                  <PandaLottieLoop data={pandaLottieData} className="scrap-account-plushie-panda-lottie" />
                </div>
              </div>
            ) : (
              <div className="scrap-account-plushie-cell scrap-account-plushie-cell--panda-still" title="panda">
                <span className="scrap-account-plushie-emoji" aria-hidden>🐼</span>
              </div>
            )}
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
                    >
                      {p.unlocked ? (
                        <span className="scrap-account-plushie-emoji" aria-hidden>🧸</span>
                      ) : (
                        <span className="scrap-account-plushie-mystery" aria-hidden>
                          <span className="scrap-account-plushie-mystery-blur">🧸</span>
                          <span className="scrap-account-plushie-mystery-mark">?</span>
                        </span>
                      )}
                    </Link>
                  ))
                )}
          </div>
        </div>
      </section>

      {/* Weather location (device) */}
      <section className="scrap-account-block">
        <h2 className="scrap-account-heading">
          <span className="scrap-account-heading-bar scrap-account-heading-bar--sky" />
          weather location
        </h2>
        <div className="scrap-account-paper scrap-account-paper--weather">
          <span className="scrap-account-tape scrap-account-tape--sky" aria-hidden />
          <p className="scrap-account-weather-lead">
            Home dashboard weather uses this. Saved on this device only.
          </p>
          <div className="scrap-account-weather-mode-row">
            <button
              type="button"
              className={`scrap-account-weather-mode${weatherLocMode === 'exact' ? ' scrap-account-weather-mode--on' : ''}`}
              onClick={() => {
                setWeatherLocMode('exact')
                setWeatherLocationMode('exact')
              }}
            >
              use exact location
            </button>
            <button
              type="button"
              className={`scrap-account-weather-mode${weatherLocMode === 'manual' ? ' scrap-account-weather-mode--on' : ''}`}
              onClick={() => {
                setWeatherLocMode('manual')
                setWeatherLocationMode('manual')
              }}
            >
              set location manually
            </button>
          </div>
          {weatherLocMode === 'manual' && (
            <div className="scrap-account-weather-manual">
              <label className="scrap-account-weather-label" htmlFor="mb-weather-place-search">
                Search city or place
              </label>
              <input
                id="mb-weather-place-search"
                type="search"
                className="scrap-account-weather-input"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="e.g. Peoria AZ"
                autoComplete="off"
              />
              {placeBusy && <p className="scrap-account-weather-hint">Searching…</p>}
              {!placeBusy && placeResults.length > 0 && (
                <ul className="scrap-account-weather-results list-none m-0 mt-2.5 p-0" role="listbox">
                  {placeResults.map((p) => (
                    <li key={`${p.lat},${p.lng},${p.label}`}>
                      <button
                        type="button"
                        className="scrap-account-weather-pick"
                        onClick={() => {
                          setManualWeatherLocation(p)
                          setManualWeather(p)
                          setPlaceQuery('')
                          setPlaceResults([])
                        }}
                      >
                        {p.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {manualWeather && (
                <p className="scrap-account-weather-saved">
                  Using: <strong>{manualWeather.label}</strong>
                  <button
                    type="button"
                    className="scrap-account-weather-clear"
                    onClick={() => {
                      clearManualWeatherLocation()
                      setManualWeather(null)
                    }}
                  >
                    clear
                  </button>
                </p>
              )}
              {!manualWeather && !placeBusy && placeQuery.trim().length >= 2 && placeResults.length === 0 && (
                <p className="scrap-account-weather-hint">No matches — try another spelling.</p>
              )}
            </div>
          )}
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
          <button
            type="button"
            className="scrap-account-action-row scrap-account-action-row--btn"
            disabled={exportBusy}
            onClick={() => {
              setAccountBanner(null)
              setExportDialogOpen(true)
            }}
          >
            <div>
              <div className="scrap-account-action-title">export my data</div>
              <div className="scrap-account-action-sub">
                {exportBusy ? 'preparing…' : 'choose JSON or PDF'}
              </div>
            </div>
            <span aria-hidden className="scrap-account-chevron">›</span>
          </button>
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

      {exportDialogOpen ? (
        <div
          className="scrap-export-overlay"
          role="presentation"
          onClick={() => !exportBusy && setExportDialogOpen(false)}
        >
          <div
            className="scrap-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scrap-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="scrap-export-title" className="scrap-export-title">
              Export your data
            </h3>
            <p className="scrap-export-lead">Pick one format. You can run export again anytime for the other.</p>
            <div className="scrap-export-options">
              <button
                type="button"
                className="scrap-export-option"
                disabled={exportBusy}
                onClick={() => void confirmExport('json')}
              >
                <span className="scrap-export-option-label">JSON file</span>
                <span className="scrap-export-option-desc">
                  Full backup of every database field plus local archives—best for moving to another device, long-term
                  storage, or tools that read JSON.
                </span>
              </button>
              <button
                type="button"
                className="scrap-export-option"
                disabled={exportBusy}
                onClick={() => void confirmExport('pdf')}
              >
                <span className="scrap-export-option-label">PDF file</span>
                <span className="scrap-export-option-desc">
                  Handoff narrative plus readable digests with bullets—easier to skim, share, or print than raw data.
                </span>
              </button>
            </div>
            <button
              type="button"
              className="scrap-export-cancel"
              disabled={exportBusy}
              onClick={() => setExportDialogOpen(false)}
            >
              cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
