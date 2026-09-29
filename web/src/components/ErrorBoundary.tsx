import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; message: string }
type State = { failed: boolean }

// Shows a message with a retry button instead of a blank app when a page fails to load (e.g. the
// Cheatsheet's data can't be fetched while offline).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app">
        <p className="error">{this.props.message}</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </main>
    )
  }
}
