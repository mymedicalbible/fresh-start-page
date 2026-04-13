import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

const LOTTIE_SRC = '/lottie/dancing-bear.lottie'

const VICTORY_WORDS = ['you', 'did', 'it!'] as const

type PlushieTokenVictoryModalProps = {
  onDismiss: () => void
}

function markDismissed () {
  try {
    sessionStorage.setItem('mb-plushie-afford-dismissed', '1')
  } catch {
    /* ignore */
  }
}

export function PlushieTokenVictoryModal ({ onDismiss }: PlushieTokenVictoryModalProps) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const dismiss = () => {
    markDismissed()
    onDismiss()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plushie-victory-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 8201,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={dismiss}
    >
      <div
        className="card shadow plushie-victory-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plushie-victory-lottie-wrap" aria-hidden>
          <DotLottieReact
            src={LOTTIE_SRC}
            loop={!reduceMotion}
            autoplay={!reduceMotion}
            className="plushie-victory-lottie"
            style={{ width: '100%', maxWidth: 220, height: 200 }}
          />
        </div>

        <h2 id="plushie-victory-title" className="plushie-victory-heading">
          {VICTORY_WORDS.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="plushie-victory-heading__word"
              style={{ animationDelay: `${0.28 + i * 0.12}s` }}
            >
              {word}
            </span>
          ))}
        </h2>

        <p className="muted plushie-victory-sub">
          You have enough tokens to unlock this week&apos;s plushie in the shop.
        </p>

        <div className="plushie-victory-actions">
          <Link
            className="btn btn-primary"
            style={{ flex: 1, minWidth: 140, justifyContent: 'center', display: 'inline-flex' }}
            to="/app/plushies"
            onClick={dismiss}
          >
            Open plushie shop
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1, minWidth: 100 }}
            onClick={dismiss}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
