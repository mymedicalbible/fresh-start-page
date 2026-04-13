import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Lottie from 'lottie-react'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import {
  isPlaceholderLottiePath,
  loadAccountPlushieDisplay,
  loadDashPlushieDisplay,
  plushieCatalogDisplayName,
  saveAccountPlushieDisplay,
  saveDashPlushieDisplay,
  type AccountPlushieDisplayPref,
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

const LONG_PRESS_MS = 520

function PlushMinePolaroid ({
  plush,
  displayName,
  dashPref,
  accountPref,
  onOpenActions,
}: {
  plush: CatalogRow
  displayName: string
  dashPref: DashPlushieDisplayPref
  accountPref: AccountPlushieDisplayPref
  onOpenActions: () => void
}) {
  const [data, setData] = useState<object | null>(null)
  const skipArt = isPlaceholderLottiePath(plush.lottie_path)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (skipArt) {
      setData(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(plush.lottie_path)
        if (!res.ok || cancelled) return
        setData(await res.json() as object)
      } catch {
        if (!cancelled) setData(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [plush.lottie_path, skipArt])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startLongPress = useCallback(() => {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      onOpenActions()
    }, LONG_PRESS_MS)
  }, [clearTimer, onOpenActions])

  const showOnDash = dashPref.mode === 'plushie' && dashPref.plushieId === plush.id
  const showOnAccount = accountPref.mode === 'plushie' && accountPref.plushieId === plush.id

  return (
    <div className="plush-mine-polaroid-wrap">
      <div
        className="plush-mine-polaroid"
        role="button"
        tabIndex={0}
        aria-label={`${displayName}. Long press or use actions to choose dashboard or account display.`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          startLongPress()
        }}
        onPointerUp={clearTimer}
        onPointerCancel={clearTimer}
        onPointerLeave={(e) => {
          if (e.pressure === 0) clearTimer()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenActions()
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onOpenActions()
        }}
      >
        <span className="plush-mine-polaroid-pin" aria-hidden />
        <div className="plush-mine-polaroid-frame">
          {skipArt
            ? null
            : data
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
        <div className="plush-mine-polaroid-caption">{displayName}</div>
        <div className="plush-mine-polaroid-badges" aria-hidden>
          {showOnDash && (
            <span className="plush-mine-polaroid-badge plush-mine-polaroid-badge--dash">
              Dashboard
            </span>
          )}
          {showOnAccount && (
            <span className="plush-mine-polaroid-badge plush-mine-polaroid-badge--acct">Account</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="plush-mine-polaroid-actions-btn"
        aria-label={`Actions for ${displayName}`}
        onClick={() => onOpenActions()}
      >
        ···
      </button>
    </div>
  )
}

function DisplayPrefSheet ({
  plush,
  displayName,
  dashPref,
  accountPref,
  onApplyDash,
  onApplyAccount,
  onClose,
}: {
  plush: CatalogRow
  displayName: string
  dashPref: DashPlushieDisplayPref
  accountPref: AccountPlushieDisplayPref
  onApplyDash: (p: DashPlushieDisplayPref) => void
  onApplyAccount: (p: AccountPlushieDisplayPref) => void
  onClose: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={backdropRef}
      className="plush-mine-sheet-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div
        className="plush-mine-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plush-mine-sheet-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="plush-mine-sheet-title" className="plush-mine-sheet-title">
          {displayName}
        </h2>
        <p className="muted plush-mine-sheet-lead">
          Where this plush appears (separate from your profile photo).
        </p>

        <fieldset className="plush-mine-sheet-field">
          <legend className="plush-mine-sheet-legend">Home dashboard</legend>
          <label className="plush-mine-sheet-row">
            <input
              type="radio"
              name="mb-dash-from-polaroid"
              checked={dashPref.mode === 'none'}
              onChange={() => onApplyDash({ mode: 'none' })}
            />
            <span>Don&apos;t show a plush on the dashboard</span>
          </label>
          <label className="plush-mine-sheet-row">
            <input
              type="radio"
              name="mb-dash-from-polaroid"
              checked={dashPref.mode === 'weekly'}
              onChange={() => onApplyDash({ mode: 'weekly' })}
            />
            <span>This week&apos;s shop plush (updates Mondays)</span>
          </label>
          <label className="plush-mine-sheet-row">
            <input
              type="radio"
              name="mb-dash-from-polaroid"
              checked={dashPref.mode === 'plushie' && dashPref.plushieId === plush.id}
              onChange={() => onApplyDash({ mode: 'plushie', plushieId: plush.id })}
            />
            <span>This plush ({displayName})</span>
          </label>
        </fieldset>

        <div className="plush-mine-sheet-field">
          <label className="plush-mine-sheet-check">
            <input
              type="checkbox"
              checked={accountPref.mode === 'plushie' && accountPref.plushieId === plush.id}
              onChange={(e) => {
                onApplyAccount(
                  e.target.checked
                    ? { mode: 'plushie', plushieId: plush.id }
                    : { mode: 'none' },
                )
              }}
            />
            <span>Feature this plush on your account page collection</span>
          </label>
        </div>

        <button type="button" className="btn btn-primary plush-mine-sheet-done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

export function MyPlushiesPage () {
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [dashPref, setDashPref] = useState<DashPlushieDisplayPref>(loadDashPlushieDisplay)
  const [accountPref, setAccountPref] = useState<AccountPlushieDisplayPref>(loadAccountPlushieDisplay)
  const [menuPlush, setMenuPlush] = useState<CatalogRow | null>(null)

  const syncPrefsFromStorage = useCallback(() => {
    setDashPref(loadDashPlushieDisplay())
    setAccountPref(loadAccountPlushieDisplay())
  }, [])

  useEffect(() => {
    window.addEventListener('mb-dash-plushie-display-changed', syncPrefsFromStorage)
    window.addEventListener('mb-account-plushie-display-changed', syncPrefsFromStorage)
    return () => {
      window.removeEventListener('mb-dash-plushie-display-changed', syncPrefsFromStorage)
      window.removeEventListener('mb-account-plushie-display-changed', syncPrefsFromStorage)
    }
  }, [syncPrefsFromStorage])

  const applyDashPref = useCallback((next: DashPlushieDisplayPref) => {
    saveDashPlushieDisplay(next)
    setDashPref(next)
  }, [])

  const applyAccountPref = useCallback((next: AccountPlushieDisplayPref) => {
    saveAccountPlushieDisplay(next)
    setAccountPref(next)
  }, [])

  useEffect(() => {
    if (unlockedIds.size === 0) return
    const p = loadDashPlushieDisplay()
    if (p.mode === 'plushie' && !unlockedIds.has(p.plushieId)) {
      const fallback: DashPlushieDisplayPref = { mode: 'weekly' }
      saveDashPlushieDisplay(fallback)
      setDashPref(fallback)
    }
    const a = loadAccountPlushieDisplay()
    if (a.mode === 'plushie' && !unlockedIds.has(a.plushieId)) {
      const cleared: AccountPlushieDisplayPref = { mode: 'none' }
      saveAccountPlushieDisplay(cleared)
      setAccountPref(cleared)
    }
  }, [unlockedIds])

  const load = useCallback(async () => {
    setError(null)
    /* Repair unlock rows from token_ledger (SECURITY DEFINER); keeps collection complete if RPC/DB drifted */
    await supabase.rpc('game_sync_plushie_unlocks_from_ledger')
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

  const menuDisplayName = menuPlush
    ? plushieCatalogDisplayName(menuPlush.slug, menuPlush.name)
    : ''

  return (
    <div className="scrapbook-inner plush-mine-page">
      <BackButton fallbackTo="/app/plushies" label="back to shop" className="scrap-back" />
      <div className="plush-mine-header">
        <h1 className="plush-mine-title">My Plushies</h1>
        <p className="muted plush-mine-sub">
          {gameTokensEnabled()
            ? 'Polaroids of plushies you unlocked. Press and hold a photo (or tap ···) to choose whether it appears on your home dashboard and on your account page.'
            : 'Polaroids of plushies you unlocked.'}
        </p>
      </div>

      {error && <div className="banner error plush-mine-banner">{error}</div>}

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
                <PlushMinePolaroid
                  key={p.id}
                  plush={p}
                  displayName={plushieCatalogDisplayName(p.slug, p.name)}
                  dashPref={dashPref}
                  accountPref={accountPref}
                  onOpenActions={() => setMenuPlush(p)}
                />
              ))}
            </div>
            )}
      </div>

      {menuPlush && (
        <DisplayPrefSheet
          plush={menuPlush}
          displayName={menuDisplayName}
          dashPref={dashPref}
          accountPref={accountPref}
          onApplyDash={applyDashPref}
          onApplyAccount={applyAccountPref}
          onClose={() => setMenuPlush(null)}
        />
      )}
    </div>
  )
}
