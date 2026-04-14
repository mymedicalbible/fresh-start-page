type AccountAvatarTurtleProps = {
  className?: string
  src?: string
}

export function AccountAvatarTurtle ({ className, src = '/account-turtle.png' }: AccountAvatarTurtleProps) {
  return (
    <div className={`account-avatar-turtle ${className ?? ''}`.trim()} aria-hidden>
      <img src={src} alt="" className="account-avatar-turtle-image" loading="eager" decoding="async" />
    </div>
  )
}
