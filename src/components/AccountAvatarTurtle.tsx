type AccountAvatarTurtleProps = {
  className?: string
}

export function AccountAvatarTurtle ({ className }: AccountAvatarTurtleProps) {
  return (
    <div className={`account-avatar-turtle ${className ?? ''}`.trim()} aria-hidden>
      <span className="account-avatar-turtle-leg account-avatar-turtle-leg--front" />
      <span className="account-avatar-turtle-leg account-avatar-turtle-leg--back" />
      <img src="/account-turtle.png" alt="" className="account-avatar-turtle-image" loading="eager" decoding="async" />
    </div>
  )
}
