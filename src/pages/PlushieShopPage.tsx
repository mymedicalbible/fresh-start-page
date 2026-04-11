import { useCallback, useEffect, useState } from 'react'
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

export function PlushieShopPage () {
  const [balance, setBalance] = useState<number | null>(null)
  const [rotationSlot, setRotationSlot] = useState(0)
  const [activePlushie, setActivePlushie] = useState<ActivePlushie | null>(null)
  const [nextPrice, setNextPrice] = useState(10)
  const [ownedActive, setOwnedActive] = useState(false)
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [lottieData, setLottieData] = useState<object | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

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
    setRotationSlot(state.rotation_slot)
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
    await load()
  }

  return (
    <div style={{ paddingBottom: 48 }}>
      <BackButton fallbackTo="/app/more" />

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Plushie shop (trial)</h2>
        <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.5, marginBottom: 12 }}>
          Optional fun: earn tokens by logging pain, episodes, questions, visits, handoff summaries, and transcript visits.
          This is not medical advice and has no cash value. Prices rise by 2 tokens after each plushie you unlock (no cap in this trial).
        </p>
        {error && <div className="banner error" style={{ marginBottom: 12 }}>{error}</div>}
        {banner && <div className="banner" style={{ marginBottom: 12, background: 'var(--mint-surface, #ecfdf5)', borderColor: 'var(--mint)' }}>{banner}</div>}
        <p style={{ margin: '0 0 16px', fontWeight: 700 }}>
          Your tokens: {balance === null ? '…' : balance}
        </p>
      </div>

      {activePlushie && (
        <div
          className="card"
          style={{
            marginTop: 14,
            textAlign: 'center',
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 42%, var(--surface-alt, #fffef9) 42%)',
            border: '1.5px solid var(--border)',
            padding: '20px 16px 20px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.75)', marginBottom: 12 }}>
            THIS WEEK&apos;S PLUSHIE
          </div>

          {/* Spotlight: beam + stage for the active Lottie */}
          <div
            style={{
              position: 'relative',
              margin: '0 auto 16px',
              maxWidth: 340,
              minHeight: 200,
              paddingBottom: 8,
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                transform: 'translateX(-50%)',
                width: 'min(100%, 300px)',
                height: 260,
                background: [
                  'radial-gradient(ellipse 48% 38% at 50% 44%, rgba(255,255,255,0.97) 0%, rgba(255,251,235,0.75) 22%, rgba(254,243,199,0.35) 38%, rgba(251,191,36,0.12) 52%, transparent 68%)',
                ].join(','),
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 4,
                transform: 'translateX(-50%)',
                width: '72%',
                height: 28,
                background: 'radial-gradient(ellipse closest-side, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.08) 45%, transparent 72%)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
            <div style={{ position: 'relative', zIndex: 1, padding: '4px 8px 0' }}>
              {lottieData
                ? (
                  <Lottie
                    animationData={lottieData}
                    loop
                    rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                    style={{
                      width: '100%',
                      maxWidth: 300,
                      height: 220,
                      margin: '0 auto',
                      display: 'block',
                    }}
                  />
                  )
                : (
                  <div style={{ fontSize: '4rem', lineHeight: 1.2, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>🧸</div>
                  )}
            </div>
          </div>

          <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 6, color: 'var(--text)' }}>{activePlushie.name}</div>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 14px' }}>
            {ownedActive
              ? 'You already own this week\'s plushie.'
              : `Cost: ${nextPrice} tokens`}
          </p>
          {!ownedActive && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ minWidth: 200, minHeight: 48 }}
              disabled={busy || (balance !== null && balance < nextPrice)}
              onClick={() => void onPurchase()}
            >
              {busy ? 'Working…' : `Spend ${nextPrice} tokens`}
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>All plushies (5-week rotation)</h3>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
          Silhouettes are locked until you unlock them. The highlighted slot is available this week.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12, marginTop: 14 }}>
          {catalog.map((p) => {
            const owned = unlockedIds.has(p.id)
            const isWeek = p.slot_index === rotationSlot
            return (
              <div
                key={p.id}
                style={{
                  borderRadius: 12,
                  border: isWeek ? '2px solid var(--mint-dark, #065f46)' : '1px solid var(--border)',
                  padding: 10,
                  textAlign: 'center',
                  opacity: owned ? 1 : 0.38,
                  filter: owned ? undefined : 'grayscale(1)',
                  background: isWeek ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg)',
                }}
              >
                <div style={{ fontSize: '2rem' }} aria-hidden>{owned ? '✓' : '?'}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 6 }}>{p.name}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 4 }}>slot {p.slot_index}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
