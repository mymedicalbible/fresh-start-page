/**
 * When the plush game is off (default; or unset `VITE_GAME_TOKENS_ENABLED`), the app shows an
 * inline SVG swimming turtle (`CuteSwimmingTurtle`) on the dashboard appt card and account.
 * Visibility defaults on and can be toggled from Account (`mb-simple-mascot-visible`).
 * Optional `VITE_SIMPLE_MASCOT_LOTTIE` is unused by the UI while the SVG mascot is used; kept for
 * future swaps if needed.
 */
const STORAGE_KEY = 'mb-simple-mascot-visible'

/** Public URL to the Lottie JSON (replace the file in `public/`). */
export function getSimpleMascotLottiePath (): string {
  const v = import.meta.env.VITE_SIMPLE_MASCOT_LOTTIE as string | undefined
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return '/lottie/simple-mascot.json'
}

/** Base URL for external image assets (e.g. WebP frames) when JSON uses `u: "images/"`. */
export function getSimpleMascotImageAssetsBase (): string {
  const jsonPath = getSimpleMascotLottiePath()
  const i = jsonPath.lastIndexOf('/')
  const dir = i >= 0 ? jsonPath.slice(0, i) : ''
  return `${dir}/images/`
}

export function loadSimpleMascotVisible (): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function saveSimpleMascotVisible (visible: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, visible ? '1' : '0')
    window.dispatchEvent(new CustomEvent('mb-simple-mascot-changed'))
  } catch {
    /* ignore */
  }
}
