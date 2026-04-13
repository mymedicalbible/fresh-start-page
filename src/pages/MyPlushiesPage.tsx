import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Lottie from 'lottie-react'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import {
  loadDashPlushieDisplay,
  saveDashPlushieDisplay,
  type DashPlushieDisplayPref,
} from '../lib/dashPlushieDisplay'
import { gameTokensEnabled } from '../lib/gameTokens'

type CatalogRow = {
  id: string
  slug: string
  name: string
  lottie_path: string
  slot_index: number
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
      <div className="plush-mine-polaroid-caption">{name}</div>
    </div>
  )
}

export function MyPlushiesPage () {
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [dashPref, setDashPref] = useState<DashPlushieDisplayPref>(loadDashPlushieDisplay)

  useEffect(() => {
    const on = () => setDashPref(loadDashPlushieDisplay())
    window.addEventListener('mb-dash-plushie-display-changed', on)
    return () => window.removeEventListener('mb-dash-plushie-display-changed', on)
  }, [])

  useEffect(() => {
    if (unlockedIds.size === 0) return
    const p = loadDashPlushieDisplay()
    if (p.mode === 'plushie' && !unlockedIds.has(p.plushieId)) {
      saveDashPlushieDisplay({ mode: 'weekly' })
    }
  }, [unlockedIds])

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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const unlockedPlushies = useMemo(
    () => catalog.filter((p) => unlockedIds.has(p.id)),
    [catalog, unlockedIds],
  )

  return (
    <div className="scrapbook-inner plush-mine-page">
      <div className="plush-mine-header">
        <BackButton fallbackTo="/app/plushies" label="back to shop" className="scrap-back" />
        <h1 className="plush-mine-title">My Plushies</h1>
        <p className="muted plush-mine-sub">
          Plushies you&apos;ve unlocked with tokens. Tap the shop anytime to add more.
        </p>
      </div>

      {error && <div className="banner error plush-mine-banner">{error}</div>}

      {gameTokensEnabled() && (
        <section className="plush-mine-dash-panel" aria-labelledby="plush-mine-dash-heading">
          <h2 id="plush-mine-dash-heading" className="plush-mine-dash-title">
            On your dashboard
          </h2>
          <p className="muted plush-mine-dash-hint">
            Choose whether the home dashboard shows a plush (optional). This does not change your profile avatar.
          </p>
          <fieldset className="plush-mine-dash-fieldset">
            <legend className="sr-only">Dashboard plush display</legend>
            <label className="plush-mine-dash-row">
              <input
                type="radio"
                name="mb-dash-plush-pref"
                checked={dashPref.mode === 'none'}
                onChange={() => saveDashPlushieDisplay({ mode: 'none' })}
              />
              <span>Don&apos;t show a plush on the dashboard</span>
            </label>
            <label className="plush-mine-dash-row">
              <input
                type="radio"
                name="mb-dash-plush-pref"
                checked={dashPref.mode === 'weekly'}
                onChange={() => saveDashPlushieDisplay({ mode: 'weekly' })}
              />
              <span>This week&apos;s rotation (same as the shop — changes each week)</span>
            </label>
            <label className="plush-mine-dash-row">
              <input
                type="radio"
                name="mb-dash-plush-pref"
                checked={dashPref.mode === 'plushie'}
                onChange={() => {
                  const first = unlockedPlushies[0]
                  if (first) saveDashPlushieDisplay({ mode: 'plushie', plushieId: first.id })
                }}
                disabled={unlockedPlushies.length === 0}
              />
              <span>A plush from my collection</span>
            </label>
            {dashPref.mode === 'plushie' && unlockedPlushies.length > 0 && (
              <div className="plush-mine-dash-sub" role="group" aria-label="Choose plush for dashboard">
                {unlockedPlushies.map((p) => (
                  <label key={p.id} className="plush-mine-dash-row plush-mine-dash-row--sub">
                    <input
                      type="radio"
                      name="mb-dash-plush-which"
                      checked={dashPref.plushieId === p.id}
                      onChange={() => saveDashPlushieDisplay({ mode: 'plushie', plushieId: p.id })}
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </section>
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
                <PlushPolaroid key={p.id} path={p.lottie_path} name={p.name} />
              ))}
            </div>
            )}
      </div>
    </div>
  )
}
