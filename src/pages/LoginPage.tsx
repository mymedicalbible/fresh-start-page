import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'


export function LoginPage () {
  const { user, loading, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)


  if (loading) {
    return (
      <div className="login-wrap muted">
        <p>Loading…</p>
      </div>
    )
  }


  if (user) return <Navigate to="/app" replace />


  async function onSubmit (e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email, password)
        if (err) setError(err.message)
      } else {
        if (!fullName.trim()) {
          setError('Please enter your name.')
          setBusy(false)
          return
        }
        const { error: err } = await signUp(email, password, fullName.trim())
        if (err) setError(err.message)
        else {
          setInfo('Check your email to confirm your account (if confirmation is enabled on your project).')
        }
      }
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2rem' }} aria-hidden>🌼</div>
          <h2 style={{ margin: '8px 0 4px' }}>Medical Bible</h2>
          <p className="muted" style={{ margin: 0 }}>Quick logs → organized history (multi-user)</p>
        </div>


        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); setInfo(null) }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null); setInfo(null) }}
          >
            Create account
          </button>
        </div>


        {error && <div className="banner error">{error}</div>}
        {info && <div className="banner success">{info}</div>}


        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>


        <p className="muted" style={{ marginTop: 16, fontSize: '0.8rem' }}>
          Health data is stored under your account in Supabase. Use a strong password and enable RLS as deployed in the included migration.
        </p>
      </div>
    </div>
  )
}
