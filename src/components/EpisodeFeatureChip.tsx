import { useLongPress } from '../lib/useLongPress'

export function EpisodeFeatureChip ({
  label,
  showRemove,
  onReveal,
  onRemove,
  removeDisabled,
}: {
  label: string
  showRemove: boolean
  onReveal: () => void
  onRemove: () => void
  removeDisabled?: boolean
}) {
  const lp = useLongPress({
    delay: 550,
    onLongPress: onReveal,
  })
  return (
    <span
      {...lp}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '0.78rem',
        padding: '4px 10px',
        borderRadius: 20,
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        color: '#065f46',
        ...lp.style,
      }}
    >
      {label}
      {showRemove && (
        <button
          type="button"
          disabled={removeDisabled}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: '0.72rem',
            lineHeight: 1,
            color: '#6b7280',
          }}
          aria-label={`Remove ${label}`}
        >
          ✕
        </button>
      )}
    </span>
  )
}
