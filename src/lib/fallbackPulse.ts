// Naive rPPG fallback — runs entirely in-browser off the webcam.
// This exists so the demo can NEVER go dark: if the Presage sidecar dies
// (no network, no API key, crashed process), the Director still gets a
// heart-rate signal, just noisier. Nobody sees this at the sponsor table,
// it's insurance for live judging.
//
// Method: average the green channel over a forehead ROI every frame,
// detrend, scan the plausible HR band with a Goertzel-style DFT, and
// report the peak — but only if the peak is actually a peak.

const WINDOW_SECONDS = 8

/**
 * The search band, in beats per minute.
 *
 * This was 42–240. The top of that range is not a human being under
 * stress, it is a hummingbird, and widening a search band is not free:
 * every extra candidate frequency is another chance for noise, or for the
 * second harmonic of the real rate, to out-score the truth. A player at 70
 * bpm has a harmonic at 140, which sat comfortably inside the old band and
 * would be reported as a racing pulse.
 *
 * 40–180 covers a resting adult through genuine fright with room to spare,
 * and Presage's own supported range (40–110) sits inside it.
 */
const MIN_BPM = 45
const MAX_BPM = 180

/**
 * High-pass window, in seconds.
 *
 * BREATHING AND SWAY WERE BEING REPORTED AS A HEART RATE. Leo saw a
 * confident 40 bpm — the exact bottom of the old band — while sitting
 * still. Reproduced: a signal containing nothing but slow leaning and
 * breathing, with no pulse in it at all, returns 40 bpm at confidence
 * 1.00. It is a genuinely sharp peak, so the peakiness floor has no
 * reason to reject it; it simply is not a heart.
 *
 * Breathing is 12-20 per minute and postural sway is slower still, so
 * their energy sits below the band — but a windowed DFT leaks, and the
 * bottom bin is where it lands. A detrend removes a straight line and a
 * Hann window softens the edges; neither removes a 0.3 Hz oscillation.
 *
 * Subtracting a running mean over ~1.3s removes everything below roughly
 * 0.77 Hz, which is 46 bpm — just under the new floor, so sway and
 * breathing are gone and a genuine slow pulse is not. This is the right
 * tool rather than simply raising the floor, because raising the floor
 * alone leaves the leakage, it just moves where it lands.
 */
const HIGHPASS_SECONDS = 1.3
const STEP_BPM = 0.5

/**
 * How much the winning frequency must stand out from the rest of the band
 * before we believe it.
 *
 * WITHOUT THIS THE ESTIMATOR ALWAYS RETURNS A NUMBER. A DFT scan over a
 * flat or purely noisy signal still has a maximum — some bin wins — so the
 * old code reported a confident-looking heart rate for a covered lens, an
 * empty chair, or a wall. In a game whose entire premise is "this is
 * reading your body", a plausible fabricated number is far worse than an
 * honest null: it is indistinguishable from the feature working, and it
 * would drive the Director off noise.
 *
 * A real pulse concentrates power in one narrow bin and typically scores
 * many times the band average. Noise is spread, and scores close to it.
 */
const MIN_PEAKINESS = 25

export interface FallbackReading {
  bpm: number | null
  confidence: number // 0-1
}

export interface GreenSample {
  /** milliseconds, any epoch — only differences are used */
  t: number
  /** mean green-channel value over the ROI */
  g: number
}

/**
 * The estimator, as a pure function of its samples.
 *
 * Split out from the class so it can be tested without a DOM, a camera or
 * a GPU. It previously lived inside a class that took an HTMLVideoElement
 * in its constructor, which meant the one piece of signal processing in
 * the project — the thing that decides whether the game has a heartbeat at
 * all when the sidecar is down — could not be exercised by anything except
 * a human sitting in front of a webcam. See scripts/pulsetest.ts.
 */
export function estimatePulse(samples: GreenSample[]): FallbackReading {
  if (samples.length < 30) return { bpm: null, confidence: 0 }

  const t0 = samples[0].t
  const xs = samples.map((s) => (s.t - t0) / 1000)
  const duration = xs[xs.length - 1] - xs[0]
  // Below about four seconds the frequency resolution is too coarse to
  // separate one plausible heart rate from the next.
  if (duration < 4) return { bpm: null, confidence: 0 }

  const ys = samples.map((s) => s.g)

  /**
   * LINEAR DETREND, not mean subtraction.
   *
   * Subtracting the mean removes a constant. It does nothing to a RAMP,
   * and a ramp is exactly what a webcam produces: auto-exposure settling,
   * a cloud crossing a window, someone leaning slowly toward the lamp.
   * That trend carries enormous low-frequency energy which leaks straight
   * into the bottom of the search band.
   *
   * It is not a subtle degradation. A clean 84 bpm signal with a realistic
   * exposure drift on top was reported as 45 bpm — the estimator locked
   * onto the drift and ignored the heart entirely.
   */
  const n = xs.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]
  }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n

  // Detrended, before the high-pass.
  const flat = new Float64Array(n)
  for (let i = 0; i < n; i++) flat[i] = ys[i] - (intercept + slope * xs[i])

  /**
   * High-pass by subtracting a running mean — see HIGHPASS_SECONDS.
   * Written against the sample TIMES rather than a fixed index width,
   * because browser frame delivery is not uniform and a fixed window of
   * samples would be a different window of seconds on every machine.
   */
  const hp = new Float64Array(n)
  {
    let lo = 0
    let hi = 0
    let sum = 0
    for (let i = 0; i < n; i++) {
      const from = xs[i] - HIGHPASS_SECONDS / 2
      const to = xs[i] + HIGHPASS_SECONDS / 2
      while (hi < n && xs[hi] <= to) sum += flat[hi++]
      while (lo < hi && xs[lo] < from) sum -= flat[lo++]
      const count = hi - lo
      hp[i] = flat[i] - (count > 0 ? sum / count : 0)
    }
  }

  /**
   * Hann window. The sample window starts and ends mid-heartbeat, and a
   * hard cut is a discontinuity whose energy smears across every bin —
   * which both blunts the true peak and raises the noise floor the peak is
   * judged against. Tapering the ends to zero removes it.
   */
  const signal = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const w = n > 1 ? 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))) : 1
    signal[i] = hp[i] * w
  }

  let bestBpm = 0
  let bestPower = 0
  const powers: number[] = []

  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += STEP_BPM) {
    const hz = bpm / 60
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      const angle = 2 * Math.PI * hz * xs[i]
      re += signal[i] * Math.cos(angle)
      im += signal[i] * Math.sin(angle)
    }
    const power = re * re + im * im
    powers.push(power)
    if (power > bestPower) {
      bestPower = power
      bestBpm = bpm
    }
  }

  if (!bestBpm || bestPower <= 0) return { bpm: null, confidence: 0 }

  /**
   * A peak pinned to the edge of the band is a peak that is probably
   * OUTSIDE it.
   *
   * The high-pass removes most of the breathing and sway energy, but a
   * finite filter never removes all of it, and whatever survives lands in
   * the lowest bin — a residue of something real at 0.2 Hz, not a heart at
   * 45. The same argument applies at the top, where the nearest real thing
   * is usually a lighting flicker harmonic.
   *
   * Refusing the outermost couple of bpm costs the ability to report a
   * resting rate below about 47, which is trained-athlete territory. That
   * is a far cheaper mistake than confidently reporting someone's
   * breathing as their pulse, which is the specific failure this whole
   * function exists to avoid.
   */
  const EDGE_BPM = 2
  if (bestBpm <= MIN_BPM + EDGE_BPM || bestBpm >= MAX_BPM - EDGE_BPM) {
    return { bpm: null, confidence: 0 }
  }

  /**
   * IS THIS A HEART, OR THE THIRD HARMONIC OF SOMEONE WALKING?
   *
   * Periodic body motion is not sinusoidal — a head bob is closer to a
   * rectified sine, which is rich in harmonics. The high-pass removes the
   * fundamental, because that sits below the band, but it cannot touch
   * the harmonics, which land squarely inside it. A bob at 18 per minute
   * puts its third harmonic at 54, and 54 is a perfectly plausible
   * resting heart rate.
   *
   * The tell is that a harmonic has a parent. If the candidate's half or
   * third has substantially MORE power than the candidate itself, then
   * the candidate is an overtone of something slower and the slower thing
   * is the real signal — which, being below the band, is not a pulse.
   *
   * A genuine pulse fails this test in the other direction: a heart at 72
   * may well have energy at 144, but it will not have more energy at 36
   * than at 72.
   */
  const powerAt = (bpm: number) => {
    const hz = bpm / 60
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      const angle = 2 * Math.PI * hz * xs[i]
      re += signal[i] * Math.cos(angle)
      im += signal[i] * Math.sin(angle)
    }
    return re * re + im * im
  }
  for (const divisor of [2, 3]) {
    const sub = bestBpm / divisor
    // Below about 9 per minute there is nothing a body does periodically
    // that we would be seeing.
    if (sub < 9) continue
    if (powerAt(sub) > bestPower * 1.5) return { bpm: null, confidence: 0 }
  }

  /**
   * Peakiness against the MEDIAN of the band, not the mean.
   *
   * The mean includes the peak and its skirts, so a strong pulse inflates
   * the very baseline it is being compared against and the ratio
   * understates how much it stands out. The median is the typical bin —
   * what the band looks like where there is no heartbeat — and is barely
   * moved by one tall spike.
   *
   * Both are scale-free: a brighter room multiplies every bin equally and
   * the ratio is unchanged. (The original confidence divided raw power by
   * the sample count, so it read near-certain in bright light and near-zero
   * in dim light whether or not a pulse was there.)
   */
  const sorted = [...powers].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || Number.MIN_VALUE
  const peakiness = bestPower / median
  if (peakiness < MIN_PEAKINESS) return { bpm: null, confidence: 0 }

  // Logarithmic, because peakiness ranges over orders of magnitude between
  // a murky reading and a clean one. A linear map saturated at 1.0 for
  // everything that passed the threshold, making confidence useless
  // precisely when it mattered — it could not tell a good reading from a
  // barely-acceptable one.
  const confidence = Math.min(
    1,
    Math.log(peakiness / MIN_PEAKINESS) / Math.log(400 / MIN_PEAKINESS),
  )
  return { bpm: Math.round(bestBpm), confidence }
}

export class FallbackPulseEstimator {
  private samples: GreenSample[] = []
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
    return estimatePulse(this.samples)
  }

  /**
   * The raw green-channel trace, for diagnosis.
   *
   * Every accuracy problem so far has been diagnosed by guessing at what
   * the camera was probably producing and then reproducing it
   * synthetically. That found the breathing bug and the drift bug, but it
   * cannot find a problem whose cause is the actual picture — a region of
   * interest landing on hair instead of skin, a face too small in frame,
   * an auto-exposure loop fighting the signal. For those the only useful
   * thing is the real samples off the real camera.
   */
  dump(): { samples: GreenSample[]; roi: { sx: number; sy: number; sw: number; sh: number }; video: { w: number; h: number } } {
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    return {
      samples: this.samples.slice(),
      roi: { sx: vw * 0.35, sy: vh * 0.12, sw: vw * 0.3, sh: vh * 0.18 },
      video: { w: vw, h: vh },
    }
  }

  /** A still of what the ROI is actually looking at, as a data URL. If the
   * pulse is being read off someone's hairline this is the fastest way to
   * see it. */
  roiSnapshot(): string | null {
    try {
      return this.canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }
}
