/**
 * App-styled confirm (replaces window.confirm). Matches LeaveLaterDialog backdrop/card.
 */

type Props = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** Primary button style */
  confirmVariant?: 'primary' | 'danger'
}

export function AppConfirmDialog ({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  confirmVariant = 'primary',
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-confirm-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 520,
        background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        className="card shadow"
        style={{ maxWidth: 400, width: '100%', borderRadius: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="app-confirm-title" style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text, #1e293b)' }}>
          {title}
        </h2>
        <p className="muted" style={{ margin: '0 0 18px', fontSize: '0.88rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className={`btn btn-block ${confirmVariant === 'danger' ? 'btn-secondary' : 'btn-primary'}`}
            style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost btn-block" style={{ minHeight: 44, fontSize: '1rem' }} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
