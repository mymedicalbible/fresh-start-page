import { Link, useLocation } from 'react-router-dom'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Lottie from 'lottie-react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { fetchGameState, gameTokensEnabled } from '../lib/gameTokens'
import { useGameStateRefresh } from '../lib/useGameStateRefresh'
import { runExportDownload } from '../lib/fullDataExport'
import { isPlaceholderLottiePath, loadAccountPlushieDisplay, type AccountPlushieDisplayPref } from '../lib/dashPlushieDisplay'
import { AccountAvatarTurtle } from '../components/AccountAvatarTurtle'
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
import {
  AVATAR_CROP_VIEWPORT_PX,
  clampPan,
  coverScaleForViewport,
  extensionForMime,
  loadImageFromUrl,
  renderCroppedAvatarBlob,
} from '../lib/avatarImage'
import {
  canUseWebPush,
  disablePushSubscription,
  registerPushSubscription,
  syncPushPrefs,
} from '../lib/pushNotifications'

function PandaLottieLoop ({
  data,
  className,
  assetsPath,
}: {
  data: object
  className?: string
  assetsPath?: string
}) {
  return (
    <Lottie
      className={className}
      animationData={data}
      loop
      rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
      {...(assetsPath ? { assetsPath } : {})}
    />
  )
}

const NOTIFY_KEYS = {
  appt: 'mb-profile-notify-appt',
  log: 'mb-profile-notify-log',
  logTime: 'mb-profile-notify-log-time',
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

function readNotifyTime (defaultTime: string): string {
  try {
    const raw = localStorage.getItem(NOTIFY_KEYS.logTime)
    if (!raw) return defaultTime
    const ok = /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw.trim())
    return ok ? raw.trim() : defaultTime
  } catch {
    return defaultTime
  }
}

function writeNotifyTime (value: string) {
  try {
    localStorage.setItem(NOTIFY_KEYS.logTime, value)
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
  const [symptomLogCount, setSymptomLogCount] = useState<number | null>(null)
  const [visitCount, setVisitCount] = useState<number | null>(null)

  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const [nextPrice, setNextPrice] = useState(10)
  const [ownedActive, setOwnedActive] = useState(false)
  const [tokensOff, setTokensOff] = useState(false)

  const [plushieSlots, setPlushieSlots] = useState<{ id: string; unlocked: boolean; lottie_path: string }[]>([])
  const [accountPlushPref, setAccountPlushPref] = useState<AccountPlushieDisplayPref>(loadAccountPlushieDisplay)
  const [accountFeaturedLottie, setAccountFeaturedLottie] = useState<object | null>(null)

  const [notifyAppt, setNotifyAppt] = useState(() => readNotify(NOTIFY_KEYS.appt, true))
  const [notifyLog, setNotifyLog] = useState(() => readNotify(NOTIFY_KEYS.log, true))
  const [notifyLogTime, setNotifyLogTime] = useState(() => readNotifyTime('20:00'))
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(() => canUseWebPush())
  const [pushPermission, setPushPermission] = useState<string>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))
  const [pushBusy, setPushBusy] = useState(false)

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
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [avatarCropOpen, setAvatarCropOpen] = useState(false)
  const [cropObjectUrl, setCropObjectUrl] = useState<string | null>(null)
  const [cropIw, setCropIw] = useState(0)
  const [cropIh, setCropIh] = useState(0)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 })
  const [cropImageBusy, setCropImageBusy] = useState(false)
  const [cropImageError, setCropImageError] = useState<string | null>(null)
  const cropDragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  })
  const cropPanRef = useRef(cropPan)
  cropPanRef.current = cropPan

  const closeCropModal = useCallback(() => {
    setAvatarCropOpen(false)
    setCropObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCropIw(0)
    setCropIh(0)
    setCropZoom(1)
    setCropPan({ x: 0, y: 0 })
    setCropImageError(null)
    setCropImageBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const loadStats = useCallback(async () => {
    if (!user) return
    const [p, e, v] = await Promise.all([
      supabase.from('pain_entries').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('mcas_symptom_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('doctor_visits').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    setPainCount(p.count ?? 0)
    setSymptomLogCount(e.count ?? 0)
    setVisitCount(v.count ?? 0)
  }, [user])

  const loadGameAndPlushies = useCallback(async () => {
    if (!user) return
    if (!gameTokensEnabled()) {
      setTokensOff(true)
      setActivePlushieLottiePath(null)
      setPandaLottieData(null)
      setPlushieSlots([])
      return
    }
    const [cat, un] = await Promise.all([
      supabase.from('plushie_catalog').select('id, slot_index, slug, lottie_path').order('slot_index').limit(12),
      supabase.from('user_plushie_unlocks').select('plushie_id'),
    ])
    if (!cat.error) {
      const unlocked = new Set((un.data ?? []).map((r: { plushie_id: string }) => r.plushie_id))
      const rows = (cat.data ?? []) as { id: string; slot_index: number; slug?: string; lottie_path?: string }[]
      const withoutPanda = rows.filter((r) => (r.slug ?? '') !== 'panda-popcorn')
      setPlushieSlots(
        withoutPanda.slice(0, 16).map((r) => ({
          id: r.id,
          unlocked: unlocked.has(r.id),
          lottie_path: (r.lottie_path ?? '').trim(),
        })),
      )
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

  const loadProfileAvatar = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', user.id)
      .maybeSingle()
    if (error) return
    const rawPath = (data?.avatar_path ?? '').trim()
    if (!rawPath) {
      setProfileAvatarUrl(null)
      return
    }
    const { data: signed, error: signErr } = await supabase
      .storage
      .from('profile-icons')
      .createSignedUrl(rawPath, 60 * 60)
    if (signErr || !signed?.signedUrl) {
      setProfileAvatarUrl(null)
      return
    }
    setProfileAvatarUrl(signed.signedUrl)
  }, [user])

  const buildPushPrefs = useCallback(() => ({
    notificationsEnabled: pushEnabled,
    appointmentRemindersEnabled: notifyAppt,
    dailyNudgeEnabled: notifyLog,
    dailyNudgeTimeLocal: notifyLog ? notifyLogTime : null,
  }), [pushEnabled, notifyAppt, notifyLog, notifyLogTime])

  const loadPushState = useCallback(async () => {
    if (!user || !canUseWebPush()) return
    setPushSupported(true)
    setPushPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default')
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      setPushEnabled(!!sub)
      if (!sub) return
      const { data } = await supabase
        .from('push_subscriptions')
        .select('notifications_enabled, appointment_reminders_enabled, daily_nudge_enabled, daily_nudge_time_local')
        .eq('endpoint', sub.endpoint)
        .maybeSingle()
      if (data) {
        setNotifyAppt(!!data.appointment_reminders_enabled)
        setNotifyLog(!!data.daily_nudge_enabled)
        if (typeof data.daily_nudge_time_local === 'string' && data.daily_nudge_time_local.slice(0, 5)) {
          setNotifyLogTime(data.daily_nudge_time_local.slice(0, 5))
        }
      }
    } catch {
      setPushEnabled(false)
    }
  }, [user])

  useGameStateRefresh(!!user && gameTokensEnabled(), () => {
    void loadGameAndPlushies()
  })

  useEffect(() => {
    void loadStats()
    void loadGameAndPlushies()
    void loadProfileAvatar()
    void loadPushState()
  }, [loadStats, loadGameAndPlushies, loadProfileAvatar, loadPushState, profilePath])

  useEffect(() => {
    writeNotify(NOTIFY_KEYS.appt, notifyAppt)
  }, [notifyAppt])

  useEffect(() => {
    writeNotify(NOTIFY_KEYS.log, notifyLog)
  }, [notifyLog])

  useEffect(() => {
    writeNotifyTime(notifyLogTime)
  }, [notifyLogTime])

  useEffect(() => {
    if (!pushEnabled || !user || !pushSupported) return
    void syncPushPrefs(buildPushPrefs()).catch(() => {
      // keep UI responsive; banner noise would be annoying for passive sync
    })
  }, [pushEnabled, user, pushSupported, buildPushPrefs])

  useEffect(() => {
    const onAcc = () => setAccountPlushPref(loadAccountPlushieDisplay())
    window.addEventListener('mb-account-plushie-display-changed', onAcc)
    return () => window.removeEventListener('mb-account-plushie-display-changed', onAcc)
  }, [])

  useEffect(() => {
    if (accountPlushPref.mode !== 'plushie') {
      setAccountFeaturedLottie(null)
      return
    }
    const row = plushieSlots.find((s) => s.id === accountPlushPref.plushieId && s.unlocked)
    if (!row?.lottie_path || isPlaceholderLottiePath(row.lottie_path)) {
      setAccountFeaturedLottie(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(row.lottie_path)
        if (!res.ok || cancelled) return
        setAccountFeaturedLottie(await res.json() as object)
      } catch {
        if (!cancelled) setAccountFeaturedLottie(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountPlushPref, plushieSlots])

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

  useEffect(() => {
    if (!avatarCropOpen || !cropObjectUrl) return
    let cancelled = false
    setCropImageBusy(true)
    setCropImageError(null)
    setCropIw(0)
    setCropIh(0)
    void loadImageFromUrl(cropObjectUrl)
      .then((img) => {
        if (cancelled) return
        setCropIw(img.naturalWidth)
        setCropIh(img.naturalHeight)
        setCropZoom(1)
        setCropPan({ x: 0, y: 0 })
      })
      .catch(() => {
        if (!cancelled) setCropImageError('Could not load this image.')
      })
      .finally(() => {
        if (!cancelled) setCropImageBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [avatarCropOpen, cropObjectUrl])

  useEffect(() => {
    if (!cropIw || !cropIh) return
    const { x, y } = cropPanRef.current
    const c = clampPan(cropIw, cropIh, AVATAR_CROP_VIEWPORT_PX, cropZoom, x, y)
    if (c.panX !== x || c.panY !== y) {
      setCropPan({ x: c.panX, y: c.panY })
    }
  }, [cropZoom, cropIw, cropIh])

  useEffect(() => {
    if (!avatarCropOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCropModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [avatarCropOpen, closeCropModal])

  async function onEnablePushNotifications () {
    if (!user || pushBusy) return
    if (!pushSupported) {
      setAccountBanner('Web push is not supported in this browser.')
      return
    }
    setPushBusy(true)
    setAccountBanner(null)
    try {
      const prefs = {
        notificationsEnabled: true,
        appointmentRemindersEnabled: notifyAppt,
        dailyNudgeEnabled: notifyLog,
        dailyNudgeTimeLocal: notifyLog ? notifyLogTime : null,
      }
      await registerPushSubscription(prefs)
      setPushEnabled(true)
      setPushPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default')
      setAccountBanner('Push notifications enabled on this device.')
    } catch (e) {
      setAccountBanner(e instanceof Error ? e.message : 'Could not enable push notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  async function onDisablePushNotifications () {
    if (pushBusy) return
    setPushBusy(true)
    setAccountBanner(null)
    try {
      await disablePushSubscription()
      setPushEnabled(false)
      setAccountBanner('Push notifications disabled on this device.')
    } catch (e) {
      setAccountBanner(e instanceof Error ? e.message : 'Could not disable push notifications.')
    } finally {
      setPushBusy(false)
    }
  }

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

  function onPickAvatarFile (file: File | null) {
    if (!user || !file || avatarUploading) return
    const fileType = file.type.toLowerCase()
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(fileType)) {
      setAccountBanner('Use JPG, PNG, or WEBP for profile photo.')
      return
    }
    setAccountBanner(null)
    setCropObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setAvatarCropOpen(true)
  }

  async function onConfirmAvatarCrop () {
    if (!user || !cropObjectUrl || avatarUploading || !cropIw || !cropIh) return
    setAvatarUploading(true)
    setAccountBanner(null)
    try {
      const img = await loadImageFromUrl(cropObjectUrl)
      const { blob, mime } = await renderCroppedAvatarBlob(img, {
        iw: cropIw,
        ih: cropIh,
        viewportPx: AVATAR_CROP_VIEWPORT_PX,
        zoom: cropZoom,
        panX: cropPan.x,
        panY: cropPan.y,
      })
      const ext = extensionForMime(mime)
      const objectPath = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase
        .storage
        .from('profile-icons')
        .upload(objectPath, blob, { upsert: true, contentType: mime, cacheControl: '3600' })
      if (upErr) {
        setAccountBanner(upErr.message)
        return
      }
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ avatar_path: objectPath, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (profileErr) {
        setAccountBanner(profileErr.message)
        return
      }
      closeCropModal()
      await loadProfileAvatar()
      setAccountBanner('Profile photo updated.')
    } catch (e) {
      setAccountBanner(e instanceof Error ? e.message : 'Could not save profile photo.')
    } finally {
      setAvatarUploading(false)
    }
  }

  function onCropPointerDown (e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    cropDragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onCropPointerMove (e: React.PointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current.active || !cropIw || !cropIh) return
    const dx = e.clientX - cropDragRef.current.lastX
    const dy = e.clientY - cropDragRef.current.lastY
    cropDragRef.current.lastX = e.clientX
    cropDragRef.current.lastY = e.clientY
    setCropPan((p) => {
      const c = clampPan(cropIw, cropIh, AVATAR_CROP_VIEWPORT_PX, cropZoom, p.x + dx, p.y + dy)
      return { x: c.panX, y: c.panY }
    })
  }

  function onCropPointerUp (e: React.PointerEvent<HTMLDivElement>) {
    cropDragRef.current.active = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch { /* ignore */ }
  }

  async function onRemoveProfilePhoto () {
    if (!user || avatarUploading) return
    setAvatarUploading(true)
    setAccountBanner(null)
    try {
      const { data: files } = await supabase
        .storage
        .from('profile-icons')
        .list(user.id, { limit: 50 })
      const removePaths = (files ?? []).map((f) => `${user.id}/${f.name}`)
      if (removePaths.length > 0) {
        await supabase.storage.from('profile-icons').remove(removePaths)
      }
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ avatar_path: null, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (profileErr) {
        setAccountBanner(profileErr.message)
        return
      }
      setProfileAvatarUrl(null)
      setAccountBanner('Profile photo removed.')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!user) return null

  const cropV = AVATAR_CROP_VIEWPORT_PX
  const cropCover = cropIw > 0 && cropIh > 0 ? coverScaleForViewport(cropIw, cropIh, cropV) : 0
  const cropScale = cropCover * cropZoom
  const cropDispW = cropIw * cropScale
  const cropDispH = cropIh * cropScale

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
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="" className="scrap-account-avatar-photo" />
            ) : gameTokensEnabled() && ownedActive && pandaLottieData ? (
              <PandaLottieLoop data={pandaLottieData} className="scrap-account-avatar-lottie" />
            ) : !gameTokensEnabled() ? (
              <AccountAvatarTurtle className="scrap-account-avatar-turtle" />
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
              <span>{ownedActive ? 'unlocked' : 'this week'}</span>
              <span>
                {tokenBalance} / {nextPrice}
              </span>
            </div>
          </div>
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
            <strong>{symptomLogCount === null ? '…' : symptomLogCount}</strong>
            <span>symptom logs</span>
          </div>
          <div className="scrap-account-stat scrap-account-stat--butter scrap-account-tilt--c">
            <strong>{visitCount === null ? '…' : visitCount}</strong>
            <span>visits</span>
          </div>
        </div>
      </section>

      {gameTokensEnabled() && (
        <section className="scrap-account-block">
          <h2 className="scrap-account-heading">
            <span className="scrap-account-heading-bar scrap-account-heading-bar--pink" />
            plushie collection
          </h2>
          <div className="scrap-account-paper scrap-account-paper--plushies">
            <span className="scrap-account-tape scrap-account-tape--sage" aria-hidden />
            <div className="scrap-account-plushie-row">
              {pandaLottieData ? (
                <div className="scrap-account-plushie-cell scrap-account-plushie-cell--panda-still">
                  <div className="scrap-account-plushie-panda-static">
                    <PandaLottieLoop data={pandaLottieData} className="scrap-account-plushie-panda-lottie" />
                  </div>
                </div>
              ) : (
                <div className="scrap-account-plushie-cell scrap-account-plushie-cell--panda-still">
                  <span className="scrap-account-plushie-emoji" aria-hidden>🐼</span>
                </div>
              )}
              {plushieSlots.length === 0
                ? (
                  <p className="scrap-account-plushie-empty">
                    <Link to="/app/plushies">Plushie shop</Link>
                    {' · '}
                    <Link to="/app/plushies/mine">My plushies &amp; dashboard</Link>
                  </p>
                  )
                : (
                    plushieSlots.map((p) => {
                      const wantsFeatured = accountPlushPref.mode === 'plushie'
                        && accountPlushPref.plushieId === p.id
                        && p.unlocked
                      return (
                        <Link
                          key={p.id}
                          to="/app/plushies/mine"
                          className={`scrap-account-plushie-cell${p.unlocked ? ' scrap-account-plushie-cell--on' : ''}${wantsFeatured ? ' scrap-account-plushie-cell--featured' : ''}`}
                        >
                          {wantsFeatured && accountFeaturedLottie
                            ? (
                              <div className="scrap-account-plushie-feature-wrap">
                                <PandaLottieLoop data={accountFeaturedLottie} className="scrap-account-plushie-feature-lottie" />
                              </div>
                              )
                            : wantsFeatured
                              ? (
                                <span className="scrap-account-plushie-emoji" aria-hidden>…</span>
                                )
                              : p.unlocked
                                ? (
                                  <span className="scrap-account-plushie-emoji" aria-hidden>🧸</span>
                                  )
                                : (
                                  <span className="scrap-account-plushie-mystery" aria-hidden>
                                    <span className="scrap-account-plushie-mystery-blur">🧸</span>
                                    <span className="scrap-account-plushie-mystery-mark">?</span>
                                  </span>
                                  )}
                        </Link>
                      )
                    })
                  )}
            </div>
          </div>
        </section>
      )}

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
          <div className="scrap-account-notify-push-row">
            <div>
              <div className="scrap-account-notify-title">push notifications</div>
              <div className="scrap-account-notify-sub">
                {pushSupported
                  ? `permission: ${pushPermission}`
                  : 'not supported in this browser'}
              </div>
            </div>
            {pushEnabled ? (
              <button
                type="button"
                className="scrap-account-notify-manage"
                onClick={() => void onDisablePushNotifications()}
                disabled={pushBusy}
              >
                {pushBusy ? 'working…' : 'disable'}
              </button>
            ) : (
              <button
                type="button"
                className="scrap-account-notify-manage"
                onClick={() => void onEnablePushNotifications()}
                disabled={pushBusy || !pushSupported}
              >
                {pushBusy ? 'working…' : 'enable'}
              </button>
            )}
          </div>
          <div className="scrap-account-notify-row">
            <div>
              <div className="scrap-account-notify-title">question / visit log reminders</div>
              <div className="scrap-account-notify-sub">1 hour before and 1 hour after appointments</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyAppt}
              className={`scrap-account-switch${notifyAppt ? ' is-on' : ''}`}
              onClick={() => {
                const n = !notifyAppt
                setNotifyAppt(n)
              }}
            >
              {notifyAppt ? 'on' : 'off'}
            </button>
          </div>
          <div className="scrap-account-notify-row">
            <div>
              <div className="scrap-account-notify-title">daily log nudge</div>
              <div className="scrap-account-notify-sub">sends at your chosen time</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyLog}
              className={`scrap-account-switch${notifyLog ? ' is-on' : ''}`}
              onClick={() => {
                const n = !notifyLog
                setNotifyLog(n)
              }}
            >
              {notifyLog ? 'on' : 'off'}
            </button>
          </div>
          <div className="scrap-account-notify-time-row">
            <label htmlFor="mb-daily-nudge-time" className="scrap-account-notify-time-label">daily nudge time</label>
            <input
              id="mb-daily-nudge-time"
              type="time"
              className="scrap-account-notify-time-input"
              value={notifyLogTime}
              onChange={(e) => setNotifyLogTime(e.target.value)}
              disabled={!notifyLog}
            />
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="scrap-account-avatar-file-input"
            onChange={(e) => onPickAvatarFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="scrap-account-action-row scrap-account-action-row--btn"
            disabled={avatarUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <div>
              <div className="scrap-account-action-title">upload profile photo</div>
              <div className="scrap-account-action-sub">
                {avatarUploading ? 'uploading…' : 'JPG, PNG, WEBP — crop & resize in app'}
              </div>
            </div>
            <span aria-hidden className="scrap-account-chevron">›</span>
          </button>
          <button
            type="button"
            className="scrap-account-action-row scrap-account-action-row--btn"
            disabled={avatarUploading || !profileAvatarUrl}
            onClick={() => void onRemoveProfilePhoto()}
          >
            <div>
              <div className="scrap-account-action-title">remove profile photo</div>
              <div className="scrap-account-action-sub">use turtle icon again</div>
            </div>
            <span aria-hidden className="scrap-account-chevron">›</span>
          </button>
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

      {avatarCropOpen ? (
        <div
          className="scrap-avatar-crop-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCropModal()
          }}
        >
          <div
            className="scrap-avatar-crop-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scrap-avatar-crop-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="scrap-avatar-crop-title" className="scrap-avatar-crop-title">
              Crop profile photo
            </h3>
            <p className="scrap-avatar-crop-lead">
              Drag to move. Use zoom to frame your face. Saved as 1024×1024.
            </p>
            <div
              className="scrap-avatar-crop-viewport"
              style={{ width: cropV, height: cropV }}
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
            >
              {cropImageBusy && (
                <div className="scrap-avatar-crop-loading">Loading…</div>
              )}
              {cropImageError && (
                <div className="scrap-avatar-crop-error" role="alert">
                  {cropImageError}
                </div>
              )}
              {!cropImageBusy && !cropImageError && cropObjectUrl && cropIw > 0 && (
                <div
                  className="scrap-avatar-crop-image-wrap"
                  style={{
                    width: cropDispW,
                    height: cropDispH,
                    left: (cropV - cropDispW) / 2 + cropPan.x,
                    top: (cropV - cropDispH) / 2 + cropPan.y,
                  }}
                >
                  <img src={cropObjectUrl} alt="" draggable={false} className="scrap-avatar-crop-img" />
                </div>
              )}
            </div>
            <div className="scrap-avatar-crop-zoom">
              <label htmlFor="scrap-avatar-crop-zoom-range" className="scrap-avatar-crop-zoom-label">
                Zoom
              </label>
              <input
                id="scrap-avatar-crop-zoom-range"
                type="range"
                min={1}
                max={3}
                step={0.02}
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
                className="scrap-avatar-crop-zoom-range"
              />
            </div>
            <div className="scrap-avatar-crop-actions">
              <button
                type="button"
                className="scrap-avatar-crop-btn scrap-avatar-crop-btn--ghost"
                onClick={closeCropModal}
                disabled={avatarUploading}
              >
                cancel
              </button>
              <button
                type="button"
                className="scrap-avatar-crop-btn scrap-avatar-crop-btn--primary"
                disabled={
                  avatarUploading
                  || cropImageBusy
                  || !!cropImageError
                  || !cropIw
                }
                onClick={() => void onConfirmAvatarCrop()}
              >
                {avatarUploading ? 'saving…' : 'save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
