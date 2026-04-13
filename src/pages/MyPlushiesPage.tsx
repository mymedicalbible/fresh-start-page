import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Lottie from 'lottie-react'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { gameTokensEnabled } from '../lib/gameTokens'
import {
  effectiveDashPlushieDisplay,
  saveDashPlushieDisplay,
  type DashPlushieDisplayPref,
} from '../lib/dashPlushieDisplay'

type CatalogRow = {
  id: string
  slug: string
  name: string
  lottie_path: string
  slot_index: number
}

function PlushPolaroid ({ path }: { path: string }) {
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
    <div className="plush-mine-polaroid">
      <span className="plush-mine-polaroid-pin" aria-hidden />
      <div className="plush-mine-polaroid-frame">
        {data
          ? (
            <Lottie
              animationData={data}
              loop
              rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
              className="plush-mine-polaroid-lottie"
            />
            )
          : (
            <span className="plush-mine-polaroid-loading" aria-hidden>…</span>
            )}
      </div>
    </div>
  )
}

export function MyPlushiesPage () {
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [dashPref, setDashPref] = useState<DashPlushieDisplayPref>(() => effectiveDashPlushieDisplay())

  const load = useCallback(async () => {
    setError(null)
    const [cat, un] = await Promise.all([
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

    setDashPref(effectiveDashPlushieDisplay())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const unlockedPlushies = useMemo(
    () => catalog.filter((p) => unlockedIds.has(p.id)),
    [catalog, unlockedIds],
  )

  function setDashboardChoice (next: DashPlushieDisplayPref) {
    saveDashPlushieDisplay(next)
    setDashPref(next)
  }

  return (
    <div className="scrapbook-inner plush-mine-page">
      <div className="plush-mine-header">
        <BackButton fallbackTo="/app/plushies" label="back to shop" className="scrap-back" />
        <h1 className="plush-mine-title">My Plushies</h1>
        <p className="muted plush-mine-sub">
          Plushies you&apos;ve unlocked with tokens. Choose whether one appears on your dashboard (optional).
        </p>
      </div>

      {error && <div className="banner error plush-mine-banner">{error}</div>}

      {unlockedPlushies.length > 0 && gameTokensEnabled() && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Dashboard</h3>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 12px', lineHeight: 1.45 }}>
            Pick which plush shows next to appointments on the home screen, or hide it entirely.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="radio"
                name="dash-plush"
                checked={dashPref.kind === 'none'}
                onChange={() => setDashboardChoice({ kind: 'none' })}
              />
              <span>Don&apos;t show a plush on the dashboard</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="radio"
                name="dash-plush"
                checked={dashPref.kind === 'weekly'}
                onChange={() => setDashboardChoice({ kind: 'weekly' })}
              />
              <span>
                This week&apos;s shop plush
                <span className="muted" style={{ display: 'block', fontSize: '0.82rem', marginTop: 4 }}>
                  Matches the shop — a new weekly plush when the timer hits zero (Monday midnight, your timezone).
                </span>
              </span>
            </label>
            {unlockedPlushies.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dash-plush"
                  checked={dashPref.kind === 'plushie' && dashPref.plushieId === p.id}
                  onChange={() => setDashboardChoice({ kind: 'plushie', plushieId: p.id })}
                />
                <span>Always show this one: {p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="plush-mine-board">
        {unlockedPlushies.length === 0
          ? (
            <p className="plush-mine-empty muted">
              No plushies yet.
              {' '}
              <Link to="/app/plushies">Go to the plushie shop</Link>
              {' '}
              to earn tokens and unlock this week&apos;s friend.
            </p>
            )
          : (
            <div className="plush-mine-grid">
              {unlockedPlushies.map((p) => (
                <PlushPolaroid key={p.id} path={p.lottie_path} />
              ))}
            </div>
            )}
      </div>
    </div>
  )
}
