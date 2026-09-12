import { useEffect, useRef } from 'react'
import { usePulseSource } from '../lib/usePulse'
import { useBlinkDetection } from '../lib/useBlinkDetection'

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
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
      })
      .catch((err) => console.error('[webcam] getUserMedia failed', err))

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
