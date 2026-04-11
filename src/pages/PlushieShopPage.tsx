import { useCallback, useEffect, useState } from 'react'
import Lottie from 'lottie-react'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import {
  fetchGameState,
  gameTokensEnabled,
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
  const [enabled] = useState(() => gameTokensEnabled())
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
    if (!enabled) return
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
  }, [enabled])

  useEffect(() => {
    void load()
  }, [load])

  async function onPurchase () {
    if (!enabled || busy) return
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

  if (!enabled) {
    return (
      <div>
        <BackButton fallbackTo="/app/more" />
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Plushie collection is disabled. Set <code>VITE_GAME_TOKENS_ENABLED=true</code> and apply the game migration.
          </p>
        </div>
      </div>
    )
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
            background: 'radial-gradient(ellipse at center top, rgba(255,255,255,0.95) 0%, var(--surface-alt, #fffef9) 55%, #1e293b 55%)',
            border: '1.5px solid var(--border)',
            padding: '24px 16px 20px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 8 }}>
            THIS WEEK&apos;S PLUSHIE
          </div>
          <div style={{ maxWidth: 200, margin: '0 auto 12px', minHeight: 160 }}>
            {lottieData
              ? (
                <Lottie animationData={lottieData} loop style={{ width: 200, height: 200, margin: '0 auto' }} />
                )
              : (
                <div style={{ fontSize: '4rem', lineHeight: 1.2 }} aria-hidden>🧸</div>
                )}
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 6 }}>{activePlushie.name}</div>
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
