import { Link } from 'react-router-dom'

export function NotFoundPage () {
  return (
    <div className="login-wrap" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
      <h1 className="h2" style={{ marginBottom: '0.5rem' }}>Page not found</h1>
      <p className="muted" style={{ marginBottom: '1.25rem' }}>
        That address isn&apos;t part of this app.
      </p>
      <p>
        <Link to="/app">Back to home</Link>
        {' · '}
        <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
