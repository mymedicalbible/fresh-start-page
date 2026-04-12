import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Lottie from 'lottie-react'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import {
  fetchGameState,
  purchaseActivePlushie,
  type ActivePlushie,
} from '../lib/gameTokens'

type CatalogRow = {
  id: string
  slug: string
  name: string
  lottie_path: string
  slot_index: number
}

/** Match Postgres `game_get_state`: slot = mod((current_date - anchor) / 7, 5) using UTC calendar days. */
function computeNextRotationUtcMs (anchorStr: string): number | null {
  try {
    const parts = anchorStr.trim().split('-').map(Number)
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null
    const [y, mo, d] = parts
    const anchor = new Date(Date.UTC(y, mo - 1, d))
    const now = new Date()
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const daysSince = Math.floor((todayUtc.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000))
    const weekIndex = Math.floor(daysSince / 7)
    return anchor.getTime() + (weekIndex + 1) * 7 * 24 * 60 * 60 * 1000
  } catch {
    return null
  }
}

function formatCountdown (remainingMs: number): { d: number; h: number; m: number; s: number } {
  const sec = Math.max(0, Math.floor(remainingMs / 1000))
  return {
    d: Math.floor(sec / 86400),
    h: Math.floor((sec % 86400) / 3600),
    m: Math.floor((sec % 3600) / 60),
    s: sec % 60,
  }
}

function PlushPolaroid ({ path, name }: { path: string; name: string }) {
  const [data, setData] = useState<object | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(path)
        if (!res.ok || cancelled) return
        setData(await res.json() as object)
      } catch {
        if (!cancelled) setData(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  return (
    <div className="plush-shop-polaroid">
      <span className="plush-shop-polaroid-pin" aria-hidden />
      <div className="plush-shop-polaroid-frame">
        {data
          ? (
            <Lottie
              animationData={data}
              loop
              rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
              className="plush-shop-polaroid-lottie"
            />
            )
          : (
            <span className="plush-shop-polaroid-loading" aria-hidden>…</span>
            )}
      </div>
      <div className="plush-shop-polaroid-caption">{name}</div>
    </div>
  )
}

export function PlushieShopPage () {
  const [balance, setBalance] = useState<number | null>(null)
  const [activePlushie, setActivePlushie] = useState<ActivePlushie | null>(null)
  const [nextPrice, setNextPrice] = useState(10)
  const [ownedActive, setOwnedActive] = useState(false)
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [lottieData, setLottieData] = useState<object | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [rotationAnchorStr, setRotationAnchorStr] = useState<string | null>(null)
  const [countdownRemainMs, setCountdownRemainMs] = useState(0)
  const [myPlushiesOpen, setMyPlushiesOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const [state, cat, un, cfg] = await Promise.all([
      fetchGameState(),
      supabase.from('plushie_catalog').select('id, slug, name, lottie_path, slot_index').order('slot_index'),
      supabase.from('user_plushie_unlocks').select('plushie_id'),
      supabase.from('game_config').select('value').eq('key', 'rotation_anchor').maybeSingle(),
    ])
    if (cat.error) {
      setError(cat.error.message)
      return
    }
    setCatalog((cat.data ?? []) as CatalogRow[])
    if (un.error) {
      setError(un.error.message)
      return
    }
    const ids = new Set((un.data ?? []).map((r: { plushie_id: string }) => r.plushie_id))
    setUnlockedIds(ids)

    setRotationAnchorStr(!cfg.error && cfg.data?.value ? cfg.data.value : null)

    if (!state.ok) {
      setError(state.error)
      return
    }
    setBalance(state.balance)
    setActivePlushie(state.active_plushie)
    setNextPrice(state.next_price)
    setOwnedActive(state.owned_active)

    const path = state.active_plushie.lottie_path
    try {
      const res = await fetch(path)
      if (res.ok) {
        setLottieData(await res.json())
      } else {
        setLottieData(null)
      }
    } catch {
      setLottieData(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!myPlushiesOpen) return
    function onKey (e: KeyboardEvent) {
      if (e.key === 'Escape') setMyPlushiesOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [myPlushiesOpen])

  useEffect(() => {
    if (!rotationAnchorStr) {
      setCountdownRemainMs(0)
      return
    }
    const tick = () => {
      const target = computeNextRotationUtcMs(rotationAnchorStr)
      if (target == null) {
        setCountdownRemainMs(0)
        return
      }
      setCountdownRemainMs(Math.max(0, target - Date.now()))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [rotationAnchorStr])

  const cd = useMemo(() => formatCountdown(countdownRemainMs), [countdownRemainMs])

  const unlockedPlushies = useMemo(
    () => catalog.filter((p) => unlockedIds.has(p.id)),
    [catalog, unlockedIds],
  )

  async function onPurchase () {
    if (busy) return
    setBusy(true)
    setBanner(null)
    const r = await purchaseActivePlushie()
    setBusy(false)
    if (!r.ok) {
      setBanner(r.error === 'insufficient_tokens'
        ? `Need ${r.needed ?? nextPrice} tokens (you have ${r.balance ?? balance ?? 0}).`
        : r.error)
      return
    }
    setBanner(`Unlocked! Spent ${r.spent} tokens.`)
    try {
      sessionStorage.setItem('mb-dash-plushie-celebrate', '1')
    } catch { /* ignore */ }
    await load()
  }

  const overlay = myPlushiesOpen
    ? createPortal(
        <div
          className="plush-shop-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plush-shop-overlay-title"
        >
          <div
            className="plush-shop-overlay-backdrop"
            role="presentation"
            onClick={() => setMyPlushiesOpen(false)}
          />
          <div className="plush-shop-overlay-panel">
            <div className="plush-shop-overlay-header">
              <h2 id="plush-shop-overlay-title" className="plush-shop-overlay-title">
                My Plushies
              </h2>
              <button
                type="button"
                className="btn btn-secondary plush-shop-overlay-close"
                onClick={() => setMyPlushiesOpen(false)}
              >
                Close
              </button>
            </div>
            {unlockedPlushies.length === 0
              ? (
                <p className="plush-shop-overlay-empty muted">
                  You haven&apos;t unlocked any plushies yet. Earn tokens and buy this week&apos;s friend from the shop.
                </p>
                )
              : (
                <div className="plush-shop-polaroid-grid">
                  {unlockedPlushies.map((p) => (
                    <PlushPolaroid key={p.id} path={p.lottie_path} name={p.name} />
                  ))}
                </div>
                )}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div className="plush-shop-page">
      <BackButton fallbackTo="/app/more" />

      <div className="card plush-shop-disclaimer">
        <h2 className="plush-shop-disclaimer-title">Plushie shop</h2>
        <p className="muted plush-shop-disclaimer-text">
          Optional fun: earn tokens by logging pain, episodes, questions, visits, handoff summaries, and transcript visits.
          This is not medical advice and has no cash value. Prices rise by 2 tokens after each plushie you unlock (no cap in this trial).
        </p>
        {error && <div className="banner error plush-shop-banner">{error}</div>}
        {banner && (
          <div className="banner plush-shop-banner" style={{ background: 'var(--mint-surface, #ecfdf5)', borderColor: 'var(--mint)' }}>
            {banner}
          </div>
        )}
        <p className="plush-shop-token-line">
          Your tokens:
          {' '}
          <strong>{balance === null ? '…' : balance}</strong>
        </p>
      </div>

      {activePlushie && (
        <section className="plush-shop-hero-card" aria-labelledby="plush-shop-hero-heading">
          <div className="plush-shop-hero-inner">
            <span className="plush-shop-hero-badge">This week&apos;s plushie</span>
            <div className="plush-shop-hero-stage">
              {lottieData
                ? (
                  <Lottie
                    animationData={lottieData}
                    loop
                    rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                    className="plush-shop-hero-lottie"
                  />
                  )
                : (
                  <div className="plush-shop-hero-fallback" aria-hidden>🧸</div>
                  )}
            </div>
            <h3 id="plush-shop-hero-heading" className="plush-shop-hero-name">{activePlushie.name}</h3>
            <p className="muted plush-shop-hero-tagline">
              {ownedActive
                ? 'You already own this week\'s plushie.'
                : `A new friend for your dashboard — unlock with tokens.`}
            </p>
            <p className="plush-shop-hero-price">
              <span aria-hidden>✨</span>
              {' '}
              {ownedActive ? 'Owned' : `${nextPrice} tokens`}
            </p>
            {!ownedActive && (
              <button
                type="button"
                className="btn btn-primary plush-shop-hero-buy"
                disabled={busy || (balance !== null && balance < nextPrice)}
                onClick={() => void onPurchase()}
              >
                {busy ? 'Working…' : `Spend ${nextPrice} tokens`}
              </button>
            )}
          </div>
        </section>
      )}

      {rotationAnchorStr && (
        <section className="plush-shop-next-card" aria-labelledby="plush-shop-next-heading">
          <h3 id="plush-shop-next-heading" className="plush-shop-next-title">Coming next week…</h3>
          <div className="plush-shop-mystery-box" aria-hidden>
            <div className="plush-shop-mystery-lid" />
            <div className="plush-shop-mystery-body">
              <span className="plush-shop-mystery-q">?</span>
            </div>
            <span className="plush-shop-mystery-spark" aria-hidden>✨</span>
          </div>
          <p className="plush-shop-next-line">A new friend is hiding in the box!</p>
          <p className="plush-shop-next-line plush-shop-next-line--sub">Come back when the timer hits zero to find out who.</p>
          <div className="plush-shop-countdown" role="timer" aria-live="polite" aria-atomic="true">
            <div className="plush-shop-countdown-cell">
              <span className="plush-shop-countdown-num">{String(cd.d).padStart(2, '0')}</span>
              <span className="plush-shop-countdown-label">days</span>
            </div>
            <div className="plush-shop-countdown-cell">
              <span className="plush-shop-countdown-num">{String(cd.h).padStart(2, '0')}</span>
              <span className="plush-shop-countdown-label">hrs</span>
            </div>
            <div className="plush-shop-countdown-cell">
              <span className="plush-shop-countdown-num">{String(cd.m).padStart(2, '0')}</span>
              <span className="plush-shop-countdown-label">min</span>
            </div>
            <div className="plush-shop-countdown-cell">
              <span className="plush-shop-countdown-num">{String(cd.s).padStart(2, '0')}</span>
              <span className="plush-shop-countdown-label">sec</span>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        className="btn btn-primary plush-shop-my-plushies-btn"
        onClick={() => setMyPlushiesOpen(true)}
      >
        My Plushies
      </button>

      {overlay}
    </div>
  )
}
