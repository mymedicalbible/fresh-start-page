type Props = {
  onConfirmLeave: () => void
  onStay: () => void
}

export function LeaveHomeConfirmDialog ({ onConfirmLeave, onStay }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-home-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onStay}
    >
      <div
        className="card shadow"
        style={{ maxWidth: 380, width: '100%', borderRadius: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="leave-home-title" style={{ margin: '0 0 18px', fontSize: '1.05rem' }}>
          Are you sure you want to leave?
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }}
            onClick={onConfirmLeave}
          >
            Leave
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ minHeight: 44, fontSize: '1rem' }}
            onClick={onStay}
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  )
}
