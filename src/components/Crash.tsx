import { Component, type ReactNode } from 'react'

/**
 * Without this, any uncaught render error unmounts the whole tree and
 * leaves a black screen with no HUD and no explanation — which is
 * exactly what happened, and there was no way to tell a crash apart from
 * a dark corridor, a lost WebGL context, or a game state with nothing to
 * draw.
 *
 * So: catch it, say so plainly, show what broke, and always offer a way
 * out. A player should never be looking at a black screen wondering
 * whether the game is broken or they're just somewhere dark.
 */
interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
  info: string | null
}

export class Crash extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Logged as well as shown — the on-screen copy is for the player,
    // the console copy is what gets pasted to someone who can fix it.
    console.error('[dread] render crash', error, info.componentStack)
    this.setState({ info: info.componentStack?.slice(0, 600) ?? null })
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#c33',
          fontFamily: 'monospace',
          padding: 32,
          overflow: 'auto',
          zIndex: 999,
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: 2, marginBottom: 12 }}>SOMETHING BROKE</div>
        <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 20, maxWidth: 620, lineHeight: 1.6 }}>
          The game hit an error and stopped drawing. This is a bug, not something you did.
          Reload to start again — and if you can, copy the text below, it says exactly what
          went wrong.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'transparent',
            border: '1px solid #c33',
            color: '#c33',
            padding: '10px 28px',
            fontFamily: 'monospace',
            fontSize: 14,
            letterSpacing: 2,
            cursor: 'pointer',
            marginBottom: 24,
          }}
        >
          RELOAD
        </button>
        <pre style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {error.message}
          {info ? `\n${info}` : ''}
        </pre>
      </div>
    )
  }
}
