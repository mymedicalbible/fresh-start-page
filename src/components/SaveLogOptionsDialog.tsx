/**
 * Primary save action for logs: complete, draft, or dismiss.
 */

type Props = {
  title?: string
  onSaveComplete: () => void
  onSaveForLater: () => void
  onKeepEditing: () => void
}

export function SaveLogOptionsDialog ({
  title = 'Save',
  onSaveComplete,
  onSaveForLater,
  onKeepEditing,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-log-options-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onKeepEditing}
    >
      <div
        className="card shadow"
        style={{ maxWidth: 380, width: '100%', borderRadius: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="save-log-options-title" style={{ margin: '0 0 18px', fontSize: '1.05rem' }}>
          {title}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }}
            onClick={onSaveComplete}
          >
            Save as complete
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }}
            onClick={onSaveForLater}
          >
            Save for later
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ minHeight: 44, fontSize: '1rem' }}
            onClick={onKeepEditing}
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  )
}
