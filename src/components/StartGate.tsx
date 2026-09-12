import { useState } from 'react'
import { livenessConfigured, runLivenessCheck } from '../lib/liveness'

/**
 * Every browser blocks camera access and AudioContext until a real user
 * gesture. This screen IS that gesture — and doubles as the in-fiction
 * "the house is listening" cold open once calibration begins right after.
 */
export function StartGate({ onStart }: { onStart: () => void }) {
  const [starting, setStarting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  // null = not attempted yet. The house's line about you changes once it
  // has decided what you are.
  const [verdict, setVerdict] = useState<string | null>(null)
  const showLiveness = livenessConfigured() && verdict === null

  async function verifyThenStart() {
    setVerifying(true)
    const result = await runLivenessCheck()
    setVerifying(false)
    if (result.status === 'verified') {
      setVerdict(
        result.serverVerified
          ? 'CONFIRMED. Something alive is out there.'
          : 'CONFIRMED, unverified. The house will take your word for now.',
      )
    } else if (result.status === 'declined') {
      setVerdict('You would rather not say. The house noticed.')
    } else {
      // Never block entry on a verification that couldn't run.
      console.warn('[dread] liveness unavailable:', result.reason)
      setVerdict(null)
      begin()
      return
    }
    // Let the verdict land before the dark.
    setTimeout(begin, 1600)
  }

  function begin() {
    setStarting(true)
    onStart()
  }

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
      <p style={{ opacity: 0.45, fontSize: 12, letterSpacing: 1 }}>
        WASD move · arrow keys look · space jump · N mute
      </p>
      {verdict && (
        <p style={{ color: '#c33', fontSize: 13, letterSpacing: 1, opacity: 0.9 }}>{verdict}</p>
      )}

      <button
        onClick={showLiveness ? verifyThenStart : begin}
        disabled={starting || verifying}
        style={{
          background: 'transparent',
          border: '1px solid #c33',
          color: '#c33',
          padding: '10px 28px',
          fontFamily: 'monospace',
          fontSize: 14,
          letterSpacing: 2,
          cursor: starting || verifying ? 'default' : 'pointer',
        }}
      >
        {verifying
          ? 'PROVING...'
          : starting
            ? 'LISTENING...'
            : showLiveness
              ? 'PROVE YOU ARE ALIVE'
              : 'BEGIN'}
      </button>

      {/* A judge who can't get past a verification screen can't play the
          game at all, so this is always here. */}
      {showLiveness && !verifying && !starting && (
        <button
          onClick={begin}
          style={{
            background: 'none',
            border: 'none',
            color: '#c33',
            opacity: 0.35,
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 1,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          skip — just let me in
        </button>
      )}
    </div>
  )
}
