/**
 * Shared prompts for “save for later” vs discard, and resume vs start fresh.
 */

type SaveForLaterProps = {
  variant: 'saveForLater'
  onYes: () => void
  onNo: () => void
  onStay: () => void
}

type ResumeProps = {
  variant: 'resume'
  onResume: () => void
  onFresh: () => void
}

type Props = SaveForLaterProps | ResumeProps

export function LeaveLaterDialog (props: Props) {
  if (props.variant === 'saveForLater') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-later-title"
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
        onClick={() => props.onStay()}
      >
        <div
          className="card shadow"
          style={{ maxWidth: 380, width: '100%', borderRadius: 16, padding: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="leave-later-title" style={{ margin: '0 0 18px', fontSize: '1.05rem' }}>
            Save for later?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }} onClick={props.onYes}>
              Yes, save for later
            </button>
            <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }} onClick={props.onNo}>
              No, discard
            </button>
            <button type="button" className="btn btn-ghost btn-block" style={{ minHeight: 44, fontSize: '1rem' }} onClick={props.onStay}>
              Keep editing
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-draft-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(15, 23, 42, 0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div className="card shadow" style={{ maxWidth: 380, width: '100%', borderRadius: 16, padding: 20 }}>
        <h2 id="resume-draft-title" style={{ margin: '0 0 18px', fontSize: '1.05rem' }}>
          Continue where you left off?
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }} onClick={props.onResume}>
            Yes, restore my draft
          </button>
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 48, fontSize: '1.02rem', fontWeight: 600 }} onClick={props.onFresh}>
            No, start fresh
          </button>
        </div>
      </div>
    </div>
  )
}
