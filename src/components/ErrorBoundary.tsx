import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError (): State {
    return { hasError: true }
  }

  componentDidCatch (error: Error, info: ErrorInfo) {
    console.error('App render error:', error, info)
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render () {
    if (this.state.hasError) {
      return (
        <div className="login-wrap">
          <div className="login-card card">
            <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
            <p className="muted" style={{ lineHeight: 1.5 }}>
              The app hit an unexpected error while rendering this screen.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={this.handleReload}>
              Reload app
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
