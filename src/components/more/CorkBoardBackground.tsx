import type { ReactNode } from 'react'

type CorkBoardBackgroundProps = {
  children: ReactNode
}

/** Warm cork texture fill — cozy, not flat. */
export function CorkBoardBackground ({ children }: CorkBoardBackgroundProps) {
  return (
    <div className="cork-board">
      {children}
    </div>
  )
}
