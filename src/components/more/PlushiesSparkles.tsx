import { FlickerSparkle } from './FlickerSparkle'

type PlushiesSparklesProps = {
  /** Polaroid styling on the More page (same six shapes as default, with tighter polaroid glow). */
  compact?: boolean
}

const SIZES_FULL = [18, 20, 16, 20, 18, 20] as const
const SIZES_POLAROID_DENSE = [18, 20, 16, 20, 18, 20, 16, 20, 18, 20, 16, 20] as const

const CONFIGS = [
  { delay: '0ms', duration: '1.8s', rotate: '' },
  { delay: '200ms', duration: '2.35s', rotate: 'rotate-12' },
  { delay: '400ms', duration: '1.55s', rotate: '-rotate-6' },
  { delay: '90ms', duration: '2.1s', rotate: 'rotate-45' },
  { delay: '320ms', duration: '1.95s', rotate: '-rotate-12' },
  { delay: '500ms', duration: '2.25s', rotate: 'rotate-6' },
] as const

const CONFIGS_DENSE = [
  ...CONFIGS,
  { delay: '550ms', duration: '1.65s', rotate: 'rotate-12' },
  { delay: '120ms', duration: '2.05s', rotate: '' },
  { delay: '380ms', duration: '1.88s', rotate: '-rotate-45' },
  { delay: '260ms', duration: '2.15s', rotate: 'rotate-6' },
  { delay: '480ms', duration: '1.72s', rotate: '-rotate-12' },
  { delay: '620ms', duration: '2.4s', rotate: 'rotate-12' },
] as const

/** Filled SVG bursts + staggered flicker (opacity/scale keyframes), independent per sparkle. */
export function PlushiesSparkles ({ compact = false }: PlushiesSparklesProps) {
  const configs = compact ? CONFIGS_DENSE : CONFIGS
  const sizes = compact ? SIZES_POLAROID_DENSE : SIZES_FULL

  return (
    <span
      className={`cork-sparkles${compact ? ' cork-sparkles--polaroid cork-sparkles--polaroid-dense' : ''}`}
      aria-hidden
    >
      {configs.map((cfg, i) => (
        <span key={i} className={`cork-sparkles__shape cork-sparkles__shape--${i + 1}`}>
          <span className={cfg.rotate}>
            <FlickerSparkle
              size={sizes[i]}
              variant="polaroid"
              style={{
                animationDelay: cfg.delay,
                animationDuration: cfg.duration,
              }}
            />
          </span>
        </span>
      ))}
    </span>
  )
}
