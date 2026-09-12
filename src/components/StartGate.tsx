import { useEffect, useState } from 'react'

/**
 * CAMERA PRE-FLIGHT.
 *
 * The camera used to be requested only once the game itself mounted,
 * behind the start screen, and a rejection there wrote one line to the
 * console. So the entire failure — denied permission, camera held by
 * another app, page served over plain http — looked like a game that had
 * simply started, in the dark, reading nothing. The symptom Leo reported
 * was "the camera isn't on, at least there's no green light", which is
 * exactly what all of those look like from outside.
 *
 * Asking here instead does two things. The prompt now appears at the
 * moment someone deliberately clicked a button, which is when a
 * permission dialog makes sense and is least likely to be dismissed
 * blind; and if it fails we are still on a full-screen page with room to
 * say what went wrong and how to fix it, rather than in a corner readout
 * over a dark corridor.
 *
 * It never blocks entry. A refused camera drops the game into its
 * existing blind mode, which is playable — the standing rule for this
 * build is that nobody is ever stuck on a screen they cannot get past.
 */
type CameraProbe = { ok: boolean; message: string | null }

async function probeCamera(): Promise<CameraProbe> {
  if (!window.isSecureContext) {
    return {
      ok: false,
      message:
        'This page is not on https:// or localhost, so the browser will not give it a camera at all. Open the localhost address instead.',
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: 'This browser will not expose a camera to this page.' }
  }
  try {
    // Released immediately. This is a permission probe, not the capture —
    // Webcam.tsx opens the real stream a moment later, and by then the
    // grant already exists so it resolves without a second prompt.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    for (const track of stream.getTracks()) track.stop()
    return { ok: true, message: null }
  } catch (err) {
    const name = (err as { name?: string })?.name ?? ''
    if (name === 'NotAllowedError' || name === 'SecurityError')
      return {
        ok: false,
        message:
          'Camera blocked. Click the camera icon in the address bar, allow it, and reload — without it the house is hunting blind.',
      }
    if (name === 'NotReadableError' || name === 'AbortError')
      return {
        ok: false,
        message:
          'Another app is holding the camera (Zoom, Photo Booth, another tab). Quit it and reload.',
      }
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      return { ok: false, message: 'No camera found on this machine.' }
    return { ok: false, message: `Camera failed: ${name || String(err)}` }
  }
}

/**
 * This needs a keyboard, a mouse and a webcam, and the hosted link will
 * absolutely get opened on a phone. Without this, a phone visitor gets a
 * black screen and a game that cannot be controlled, which is a worse
 * first impression than an honest one — and that visitor might be a
 * judge skimming submissions between rooms.
 */
function isTouchOnly() {
  if (typeof window === 'undefined') return false
  return (
    navigator.maxTouchPoints > 0 &&
    !window.matchMedia('(pointer: fine)').matches
  )
}

/**
 * Every browser blocks camera access and AudioContext until a real user
 * gesture. This screen IS that gesture — and doubles as the in-fiction
 * "the house is listening" cold open once calibration begins right after.
 */
export function StartGate({ onStart }: { onStart: () => void }) {
  const [starting, setStarting] = useState(false)
  const [camera, setCamera] = useState<CameraProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const touchOnly = isTouchOnly()

  // If the browser already knows the answer, say so before anything is
  // clicked — a permission that was denied on a previous visit is
  // remembered, and that is the case most likely to waste someone's time.
  useEffect(() => {
    let cancelled = false
    navigator.permissions
      ?.query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== 'denied') return
        setCamera({
          ok: false,
          message:
            'Camera is blocked for this site from a previous visit. Click the camera icon in the address bar, allow it, and reload.',
        })
      })
      .catch(() => {
        // Firefox and Safari do not support querying 'camera'. Not a
        // problem: the probe on click still catches everything.
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function startWithCamera(next: () => void) {
    setProbing(true)
    const probe = await probeCamera()
    setProbing(false)
    setCamera(probe)
    // A failed probe stops here ONCE, so the message is actually read;
    // pressing the button again goes in regardless, blind.
    if (!probe.ok && camera === null) return
    next()
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
        fontFamily: 'monospace',
        zIndex: 40,
        /**
         * SCROLLABLE, AND CENTRED BY MARGIN RATHER THAN BY JUSTIFY.
         *
         * This was a fixed, full-screen flex column with
         * justifyContent:'center' and no overflow. On a short window — a
         * small laptop, a browser with several toolbars, a window that
         * isn't maximised — the content is taller than the viewport, and a
         * centred flex column overflows EQUALLY off both ends and cannot
         * be scrolled back. The BEGIN button ended up below the bottom
         * edge with no way to reach it: the game had a start screen you
         * could not start.
         *
         * Worse, it gets taller exactly when something has gone wrong,
         * because that is when the camera warning and the phone warning
         * appear — so the screen became unusable precisely when it had
         * something important to say.
         *
         * `margin: auto` on the inner block centres it when it fits and
         * simply starts at the top when it doesn't, which is the one
         * behaviour that never clips.
         */
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          margin: 'auto',
          padding: '32px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
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

      {touchOnly && (
        <p
          style={{
            color: '#ff5a5a',
            opacity: 0.9,
            fontSize: 12,
            maxWidth: 420,
            textAlign: 'center',
            lineHeight: 1.6,
            border: '1px solid rgba(255,90,90,0.35)',
            padding: '8px 12px',
          }}
        >
          This needs a keyboard and a webcam. Open it on a laptop — on a
          phone you won't be able to move, and the game reads your pulse
          off the camera.
        </p>
      )}
      {camera && !camera.ok && (
        <p
          style={{
            color: '#ff6a5a',
            fontSize: 12,
            maxWidth: 420,
            textAlign: 'center',
            lineHeight: 1.6,
            border: '1px solid rgba(255,90,90,0.55)',
            background: 'rgba(120,0,0,0.15)',
            padding: '8px 12px',
          }}
        >
          {camera.message}
          <br />
          <span style={{ opacity: 0.7 }}>Press again to play without it.</span>
        </p>
      )}

      <button
        onClick={() => startWithCamera(begin)}
        disabled={starting || probing}
        style={{
          background: 'transparent',
          border: '1px solid #c33',
          color: '#c33',
          padding: '10px 28px',
          fontFamily: 'monospace',
          fontSize: 14,
          letterSpacing: 2,
          cursor: starting || probing ? 'default' : 'pointer',
        }}
      >
        {probing ? 'LOOKING FOR YOU...' : starting ? 'LISTENING...' : 'BEGIN'}
      </button>

      </div>
    </div>
  )
}
