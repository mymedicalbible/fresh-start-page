import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'

export function ProfilePage () {
  const { user, signOut } = useAuth()
  const email = user?.email ?? ''

  return (
    <div className="scrapbook-inner">
      <div style={{ marginBottom: 14 }}>
        <BackButton fallbackTo="/app" label="back" className="scrap-back" />
      </div>
      <h1 className="scrap-heading scrap-heading--section">profile</h1>
      <p className="scrap-body" style={{ marginTop: 8 }}>{email || 'Signed in'}</p>

      <nav className="scrap-profile-links" aria-label="More">
        <Link className="scrap-profile-link" to="/app/records">records</Link>
        <Link className="scrap-profile-link" to="/app/doctors">doctors</Link>
        <Link className="scrap-profile-link" to="/app/questions">questions</Link>
        <Link className="scrap-profile-link" to={`/app/visits?returnTo=${encodeURIComponent('/app/profile')}`}>visits</Link>
        <Link className="scrap-profile-link" to="/app?handoff=1">summary</Link>
      </nav>

      <button
        type="button"
        className="scrap-handoff-open scrap-mt"
        onClick={() => signOut()}
      >
        sign out
      </button>
    </div>
  )
}
