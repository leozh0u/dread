import { useEffect, useRef } from 'react'
import { usePulseSource } from '../lib/usePulse'
import { useBlinkDetection } from '../lib/useBlinkDetection'
import { useSensorStatus } from '../lib/sensorStatus'

/**
 * Turn a getUserMedia rejection into something the player can act on.
 *
 * Every one of these used to be a single console.error and an otherwise
 * normal-looking game that quietly ran blind — which is indistinguishable
 * from the camera working but the pulse not having converged yet. The
 * browser knows precisely which of these happened; there is no reason to
 * make someone guess.
 */
function cameraFailureMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'CAMERA BLOCKED — allow camera for this site (click the camera icon in the address bar), then reload'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'NO CAMERA FOUND — plug one in, or check macOS has one enabled'
    case 'NotReadableError':
    case 'AbortError':
      return 'CAMERA IN USE — another app (Zoom, Photo Booth, another tab) has it; quit that and reload'
    default:
      return `CAMERA FAILED — ${name || String(err)}`
  }
}

/**
 * Requests the camera, plays it into a hidden <video>, and feeds the
 * unified pulse pipeline (Presage sidecar, or in-browser fallback).
 * Presage's own requirements: face + upper chest visible, well lit,
 * no flickering light source, subject roughly still. See plan notes —
 * this is why the calibration scene puts a lamp on the player.
 */
export function Webcam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  usePulseSource(videoRef)
  useBlinkDetection(videoRef)

  useEffect(() => {
    let stream: MediaStream | null = null
    const fail = (msg: string) => {
      console.error('[webcam]', msg)
      useSensorStatus.getState().setCameraError(msg)
    }

    // Checked BEFORE asking, because these two produce no permission
    // prompt and no green light — the call simply rejects, or
    // mediaDevices isn't there at all. Serving the build over a LAN
    // address rather than localhost is the easy way to hit this, and it
    // looks identical to a camera that just didn't turn on.
    if (!window.isSecureContext) {
      fail('INSECURE PAGE — cameras only work on https:// or localhost. Open the localhost address.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      fail('NO CAMERA API — this browser will not expose a camera to this page')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s
        useSensorStatus.getState().setCameraError(null)
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        // The track can end after it starts — the camera is unplugged, or
        // macOS revokes it when another app takes over. Without this the
        // panel would keep claiming the camera was fine while the green
        // light was off.
        for (const track of s.getVideoTracks()) {
          track.addEventListener('ended', () =>
            fail('CAMERA STOPPED — the video track ended; reload to try again'),
          )
        }
      })
      .catch((err) => fail(cameraFailureMessage(err)))

    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1 }}
    />
  )
}
