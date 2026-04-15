import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { DoctorNoteModalProvider } from './contexts/DoctorNoteModalContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import './index.css'

if ('serviceWorker' in navigator) {
  void window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // non-fatal: app works without push
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DoctorNoteModalProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </DoctorNoteModalProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
