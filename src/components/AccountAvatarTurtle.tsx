type AccountAvatarTurtleProps = {
  className?: string
}

export function AccountAvatarTurtle ({ className }: AccountAvatarTurtleProps) {
  return (
    <div className={`account-avatar-turtle ${className ?? ''}`.trim()} aria-hidden>
      <img src="/account-turtle.png" alt="" className="account-avatar-turtle-image" loading="eager" decoding="async" />
    </div>
  )
}
