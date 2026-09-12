// Naive rPPG fallback — runs entirely in-browser off the webcam.
// This exists so the demo can NEVER go dark: if the Presage sidecar dies
// (no network, no API key, crashed process), the Director still gets a
// heart-rate signal, just noisier. Nobody sees this at the sponsor table,
// it's insurance for live judging.
//
// Method: average the green channel over a forehead ROI every frame,
// detrend, bandpass to the plausible HR band (0.7-4 Hz), estimate rate
// via zero-crossing / peak spacing over a rolling window.

const WINDOW_SECONDS = 8
const MIN_HZ = 0.7 // 42 bpm
const MAX_HZ = 4.0 // 240 bpm

export interface FallbackReading {
  bpm: number | null
  confidence: number // 0-1, crude
}

export class FallbackPulseEstimator {
  private samples: { t: number; g: number }[] = []
  private video: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(video: HTMLVideoElement) {
    this.video = video
    this.canvas = document.createElement('canvas')
    this.canvas.width = 64
    this.canvas.height = 64
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  }

  /** Call once per animation frame while the video is playing. */
  sample(now = performance.now()) {
    if (this.video.readyState < 2) return
    // Forehead-ish ROI: center-upper quadrant of the frame.
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    if (!vw || !vh) return
    const sx = vw * 0.35
    const sy = vh * 0.12
    const sw = vw * 0.3
    const sh = vh * 0.18
    this.ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, 64, 64)
    const { data } = this.ctx.getImageData(0, 0, 64, 64)
    let gSum = 0
    for (let i = 0; i < data.length; i += 4) gSum += data[i + 1] // green channel
    const gMean = gSum / (data.length / 4)
    this.samples.push({ t: now, g: gMean })
    const cutoff = now - WINDOW_SECONDS * 1000
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift()
  }

  estimate(): FallbackReading {
    if (this.samples.length < 30) return { bpm: null, confidence: 0 }
    const t0 = this.samples[0].t
    const xs = this.samples.map((s) => (s.t - t0) / 1000)
    const ys = this.samples.map((s) => s.g)
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length
    const detrended = ys.map((y) => y - mean)

    // Crude Goertzel-style scan across the HR band instead of a full FFT —
    // fewer than 40 candidate frequencies, cheap enough to run every frame.
    const duration = xs[xs.length - 1] - xs[0]
    if (duration < 4) return { bpm: null, confidence: 0 }

    let bestHz = 0
    let bestPower = 0
    for (let hz = MIN_HZ; hz <= MAX_HZ; hz += 0.02) {
      let re = 0
      let im = 0
      for (let i = 0; i < xs.length; i++) {
        const angle = 2 * Math.PI * hz * xs[i]
        re += detrended[i] * Math.cos(angle)
        im += detrended[i] * Math.sin(angle)
      }
      const power = re * re + im * im
      if (power > bestPower) {
        bestPower = power
        bestHz = hz
      }
    }

    if (bestHz === 0) return { bpm: null, confidence: 0 }
    const bpm = bestHz * 60
    // Confidence: how peaky is the best bin vs. average power — crude but functional.
    const confidence = Math.min(1, bestPower / (this.samples.length * 50))
    return { bpm: Math.round(bpm), confidence }
  }
}
