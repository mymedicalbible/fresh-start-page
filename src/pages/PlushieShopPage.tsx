import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Lottie from 'lottie-react'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import {
  fetchGameState,
  plushieNextMondayMidnightLocalMs,
  purchaseActivePlushie,
  plushieRotationTimezone,
  type ActivePlushie,
} from '../lib/gameTokens'
import { useGameStateRefresh } from '../lib/useGameStateRefresh'
import { FlickerSparkle } from '../components/more/FlickerSparkle'

type CatalogRow = {
  id: string
  slug: string
  name: string
  lottie_path: string
  slot_index: number
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

function PlushMysteryGiftSvg () {
  const gid = useId().replace(/:/g, '')
  const lid = `lid-${gid}`
  const boxG = `box-${gid}`
  const rib = `rib-${gid}`
  return (
    <svg className="plush-shop-mystery-svg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={lid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#d8b4fe" />
        </linearGradient>
        <linearGradient id={boxG} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ede9fe" />
          <stop offset="100%" stopColor="#ddd6fe" />
        </linearGradient>
        <linearGradient id={rib} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f9a8d4" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      {/* Box body */}
      <rect x="30" y="105" width="160" height="100" rx="18" fill={`url(#${boxG})`} />
      {/* Polka dots on body */}
      <circle cx="60" cy="135" r="5" fill="white" opacity="0.45" />
      <circle cx="90" cy="155" r="4" fill="white" opacity="0.35" />
      <circle cx="145" cy="130" r="5" fill="white" opacity="0.45" />
      <circle cx="170" cy="160" r="4" fill="white" opacity="0.35" />
      <circle cx="55" cy="175" r="3.5" fill="white" opacity="0.3" />
      {/* Lid */}
      <rect x="22" y="68" width="176" height="46" rx="14" fill={`url(#${lid})`} />
      {/* Polka dots on lid */}
      <circle cx="55" cy="85" r="4" fill="white" opacity="0.4" />
      <circle cx="155" cy="88" r="4" fill="white" opacity="0.4" />
      {/* Ribbon vertical on body */}
      <rect x="100" y="105" width="20" height="100" fill={`url(#${rib})`} opacity="0.85" />
      {/* Ribbon horizontal on lid */}
      <rect x="22" y="84" width="176" height="16" fill={`url(#${rib})`} opacity="0.85" rx="4" />
      {/* Bow left loop */}
      <ellipse cx="82" cy="68" rx="30" ry="20" fill="#f9a8d4" stroke="#f472b6" strokeWidth="1.5" opacity="0.95" />
      {/* Bow right loop */}
      <ellipse cx="138" cy="68" rx="30" ry="20" fill="#f9a8d4" stroke="#f472b6" strokeWidth="1.5" opacity="0.95" />
      {/* Bow center knot */}
      <ellipse cx="110" cy="68" rx="16" ry="14" fill="#f472b6" />
      {/* Left bow tail */}
      <path d="M94 80 Q75 100 60 108" stroke="#f9a8d4" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.8" />
      {/* Right bow tail */}
      <path d="M126 80 Q145 100 160 108" stroke="#f9a8d4" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.8" />
      {/* Question mark */}
      <text x="110" y="172" textAnchor="middle" dominantBaseline="middle" fill="#7c3aed" fontSize="52" fontWeight="900" fontFamily="system-ui, sans-serif">?</text>
      {/* Sparkles */}
      <circle cx="188" cy="72" r="5" fill="#fbbf24" opacity="0.9" />
      <circle cx="28" cy="90" r="4" fill="#fbbf24" opacity="0.8" />
      <circle cx="195" cy="130" r="3.5" fill="#fcd34d" opacity="0.85" />
      <circle cx="20" cy="155" r="3" fill="#fcd34d" opacity="0.8" />
    </svg>
  )
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

const GIFT_SPARKLE_CONFIGS: Record<number, { delay: string; duration: string; rotate: string }> = {
  1: { delay: '0ms', duration: '2.1s', rotate: '' },
  2: { delay: '220ms', duration: '1.75s', rotate: 'rotate-12' },
  3: { delay: '440ms', duration: '2.3s', rotate: '-rotate-6' },
  4: { delay: '110ms', duration: '1.9s', rotate: 'rotate-45' },
  5: { delay: '330ms', duration: '2.05s', rotate: '-rotate-12' },
  6: { delay: '520ms', duration: '1.7s', rotate: 'rotate-6' },
  7: { delay: '160ms', duration: '2.2s', rotate: '-rotate-45' },
  8: { delay: '380ms', duration: '1.85s', rotate: 'rotate-12' },
}

export function PlushieShopPage () {
  const [balance, setBalance] = useState<number | null>(null)
  const [activePlushie, setActivePlushie] = useState<ActivePlushie | null>(null)
  const [nextPrice, setNextPrice] = useState(25)
  const [ownedActive, setOwnedActive] = useState(false)
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [lottieData, setLottieData] = useState<object | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [countdownRemainMs, setCountdownRemainMs] = useState(0)
  const [myPlushiesOpen, setMyPlushiesOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const [state, cat, un] = await Promise.all([
      fetchGameState(),
      supabase.from('plushie_catalog').select('id, slug, name, lottie_path, slot_index').order('slot_index'),
      supabase.from('user_plushie_unlocks').select('plushie_id'),
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

  useGameStateRefresh(true, () => {
    void load()
  }, 60_000)

  const prevCountdownRef = useRef(0)
  useEffect(() => {
    if (prevCountdownRef.current > 0 && countdownRemainMs === 0) {
      void load()
    }
    prevCountdownRef.current = countdownRemainMs
  }, [countdownRemainMs, load])

  useEffect(() => {
    if (!myPlushiesOpen) return
    function onKey (e: KeyboardEvent) {
      if (e.key === 'Escape') setMyPlushiesOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [myPlushiesOpen])

  useEffect(() => {
    const tick = () => {
      const target = plushieNextMondayMidnightLocalMs()
      setCountdownRemainMs(Math.max(0, target - Date.now()))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const cd = useMemo(() => formatCountdown(countdownRemainMs), [countdownRemainMs])

  const nextRotationAtMs = plushieNextMondayMidnightLocalMs()
  const nextRotationLabel = new Date(nextRotationAtMs).toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const rotationTzLabel = plushieRotationTimezone()

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
      <div className="plush-shop-page__bg" aria-hidden>
        <video
          className="plush-shop-page__bg-video"
          src="/video/plushies-bg.mp4"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
        />
      </div>
      <div className="plush-shop-page__content">
      <BackButton fallbackTo="/app/more" />

      <details className="plush-shop-token-help">
        <summary className="plush-shop-token-help-summary">How you earn tokens</summary>
        <ul className="plush-shop-token-help-list list-none m-0 mt-2.5 p-0">
          <li>
            <strong>1 token</strong>
            {' '}
            for each completed quick log: questions, pain, episodes, or diagnosis.
          </li>
          <li>
            <strong>2 tokens</strong>
            {' '}
            for filling in a visit log (it doesn&apos;t have to be totally complete).
          </li>
          <li>
            <strong>2 tokens</strong>
            {' '}
            for an app-generated handoff summary.
          </li>
          <li>
            <strong>3 tokens</strong>
            {' '}
            for transcribing an appointment to help fill in your visit log.
          </li>
        </ul>
      </details>

      <div style={{ padding: '0 18px 0', marginBottom: 4 }}>
        {error && <div className="banner error plush-shop-banner">{error}</div>}
        {banner && (
          <div className="banner plush-shop-banner" style={{ background: '#ecfdf5', borderColor: '#6ee7b7' }}>
            {banner}
          </div>
        )}
        <p className="plush-shop-token-line">
          ✨
          {' '}
          <strong>{balance === null ? '…' : balance}</strong>
          {' '}
          tokens
        </p>
      </div>

      {activePlushie && (
        <section className="plush-shop-hero-card" aria-labelledby="plush-shop-hero-heading">
          <div className="plush-shop-hero-inner">
            <span className="plush-shop-hero-badge">✨ This Week&apos;s Plushie!</span>
            <div className="plush-shop-hero-stage-shell">
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
            </div>
            <h3 id="plush-shop-hero-heading" className="plush-shop-hero-name">{activePlushie.name}</h3>
            <p className="muted plush-shop-hero-tagline">
              {ownedActive
                ? 'You already own this week\'s plushie.'
                : `A new friend for your dashboard — unlock with tokens.`}
            </p>
            <p className="plush-shop-hero-price">
              <span aria-hidden>⬡</span>
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

      <section className="plush-shop-next-card" aria-labelledby="plush-shop-next-heading">
          <h3 id="plush-shop-next-heading" className="plush-shop-next-title">Coming next week…</h3>
          <div className="plush-shop-mystery-box relative">
            <div className="plush-shop-mystery-box__wiggle">
              <PlushMysteryGiftSvg />
            </div>
            <span className="plush-shop-mystery-sparkles" aria-hidden>
              {(
                [
                  [1, 18],
                  [2, 16],
                  [3, 20],
                  [4, 16],
                  [5, 22],
                  [6, 16],
                  [7, 16],
                  [8, 18],
                ] as const
              ).map(([slot, size]) => {
                const cfg = GIFT_SPARKLE_CONFIGS[slot]
                return (
                  <span
                    key={slot}
                    className={`plush-shop-mystery-sparkles__sprite plush-shop-mystery-sparkles__sprite--${slot}`}
                  >
                    <span className={cfg.rotate}>
                      <FlickerSparkle
                        size={size}
                        variant="gift"
                        style={{
                          animationDelay: cfg.delay,
                          animationDuration: cfg.duration,
                        }}
                      />
                    </span>
                  </span>
                )
              })}
            </span>
          </div>
          <p className="plush-shop-next-line">A new friend is hiding in the box!</p>
          <p className="plush-shop-next-line plush-shop-next-line--sub">Come back when the timer hits zero to find out who.</p>
          {countdownRemainMs > 0 && (
            <p className="plush-shop-next-line plush-shop-next-line--sub">
              Next weekly reset (Monday 12:00 AM{' '}
              <span className="muted">{rotationTzLabel}</span>):{' '}
              <time dateTime={new Date(nextRotationAtMs).toISOString()}>{nextRotationLabel}</time>
            </p>
          )}
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

      <button
        type="button"
        className="btn btn-primary plush-shop-my-plushies-btn"
        onClick={() => setMyPlushiesOpen(true)}
      >
        My Plushies
      </button>

      {overlay}
      </div>
    </div>
  )
}
