import { useState } from 'react'

/**
 * Every browser blocks camera access and AudioContext until a real user
 * gesture. This screen IS that gesture — and doubles as the in-fiction
 * "the house is listening" cold open once calibration begins right after.
 */
export function StartGate({ onStart }: { onStart: () => void }) {
  const [starting, setStarting] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, #140505 0%, #000 75%)',
        color: '#c33',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        zIndex: 40,
        gap: 18,
      }}
    >
      <h1
        style={{
          letterSpacing: 14,
          fontSize: 42,
          fontWeight: 300,
          margin: 0,
          paddingLeft: 14, // optical centring against the tracking
          color: '#d94444',
          textShadow: '0 0 40px rgba(220,40,40,0.35)',
        }}
      >
        DREAD
      </h1>
      <p
        style={{
          opacity: 0.55,
          fontSize: 13,
          maxWidth: 430,
          textAlign: 'center',
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        Sit close. Face the light. It needs a minute to learn what calm looks like on you.
      </p>
      <p style={{ opacity: 0.32, fontSize: 11, letterSpacing: 1.5, margin: 0 }}>
        headphones strongly advised — you navigate by sound
      </p>
      <p style={{ opacity: 0.32, fontSize: 11, letterSpacing: 1.5, margin: 0 }}>
        WASD move · arrows look · space jump
      </p>
      <button
        onClick={() => {
          setStarting(true)
          onStart()
        }}
        disabled={starting}
        style={{
          marginTop: 10,
          background: 'transparent',
          border: '1px solid #c33',
          color: '#c33',
          padding: '12px 40px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          letterSpacing: 4,
          cursor: starting ? 'default' : 'pointer',
          opacity: starting ? 0.4 : 1,
          transition: 'opacity 300ms linear',
        }}
      >
        {starting ? 'LISTENING...' : 'BEGIN'}
      </button>
    </div>
  )
}
