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
        background: '#000',
        color: '#c33',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        zIndex: 40,
        gap: 16,
      }}
    >
      <h1 style={{ letterSpacing: 4, fontSize: 28 }}>DREAD</h1>
      <p style={{ opacity: 0.6, fontSize: 13, maxWidth: 440, textAlign: 'center' }}>
        Sit close. Face the light. The house needs a minute to learn what calm looks like on you.
      </p>
      <p style={{ opacity: 0.45, fontSize: 12, letterSpacing: 1 }}>
        🎧 stereo headphones strongly advised — this is a spatial-audio game
      </p>
      <button
        onClick={() => {
          setStarting(true)
          onStart()
        }}
        disabled={starting}
        style={{
          background: 'transparent',
          border: '1px solid #c33',
          color: '#c33',
          padding: '10px 28px',
          fontFamily: 'monospace',
          fontSize: 14,
          letterSpacing: 2,
          cursor: starting ? 'default' : 'pointer',
        }}
      >
        {starting ? 'LISTENING...' : 'BEGIN'}
      </button>
    </div>
  )
}
