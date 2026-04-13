import { Sparkles } from 'lucide-react'

type PlushiesSparklesProps = {
  /** Polaroid styling on the More page (same six shapes as default, with tighter polaroid glow). */
  compact?: boolean
}

const SIZES_FULL = [14, 16, 12, 16, 14, 16] as const
const SIZES_POLAROID_DENSE = [14, 16, 12, 16, 14, 16, 12, 16, 14, 16, 12, 16] as const

const CONFIGS = [
  { anim: 'animate-pulse', delay: '0ms', rotate: '' },
  { anim: 'animate-bounce', delay: '150ms', rotate: 'rotate-12' },
  { anim: 'animate-pulse', delay: '300ms', rotate: '-rotate-6' },
  { anim: 'animate-pulse', delay: '75ms', rotate: 'rotate-45' },
  { anim: 'animate-bounce', delay: '225ms', rotate: '-rotate-12' },
  { anim: 'animate-pulse', delay: '450ms', rotate: 'rotate-6' },
] as const

const CONFIGS_DENSE = [
  ...CONFIGS,
  { anim: 'animate-pulse', delay: '525ms', rotate: 'rotate-12' },
  { anim: 'animate-bounce', delay: '100ms', rotate: '' },
  { anim: 'animate-pulse', delay: '375ms', rotate: '-rotate-45' },
  { anim: 'animate-pulse', delay: '250ms', rotate: 'rotate-6' },
  { anim: 'animate-bounce', delay: '475ms', rotate: '-rotate-12' },
  { anim: 'animate-pulse', delay: '600ms', rotate: 'rotate-12' },
] as const

/** Lucide `Sparkles` — staggered delays + mixed pulse/bounce so each reads independent. */
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
          <Sparkles
            size={sizes[i]}
            strokeWidth={1.75}
            style={{ animationDelay: cfg.delay }}
            className={`text-yellow-400 ${cfg.anim} ${cfg.rotate} motion-reduce:animate-none motion-reduce:opacity-70`}
          />
        </span>
      ))}
    </span>
  )
}
