/**
 * Pumps webcam frames from the browser to the Presage sidecar.
 *
 * WHY THE BROWSER SENDS THE FRAMES, rather than the sidecar just opening
 * the camera itself: a Node process started from a terminal has no macOS
 * camera grant. AVFoundation will happily open the device and then deliver
 * nothing at all, with no error — measured at 0 frames and 0 validation
 * events over 20 seconds. Meanwhile the browser already holds the camera,
 * because the game needs it for blink detection and the fallback pulse
 * estimator. So there is exactly one camera owner, and it is the one that
 * actually has permission.
 *
 * Wire format, which must match sidecar/server.js exactly:
 *   uint16 width | uint16 height | float64 timestamp(µs) | RGBA bytes
 *
 * RGBA rather than RGB deliberately. Canvas hands back RGBA, so sending it
 * straight through skips a 300k-iteration repack per frame on the main
 * thread — the SDK does that conversion in C++ instead. It costs 33% more
 * bytes over a loopback socket, which is free, to save work on the thread
 * that is also rendering the game.
 */

import { useSensorStatus } from './sensorStatus'

/**
 * 480x360 at ~24fps. Presage needs enough pixels on the face to read
 * colour change in the skin, and enough frame rate that it doesn't report
 * kFrameRateTooLow — but this is competing with a 3D renderer for the main
 * thread, so it can't be 1080p60. At a normal sitting distance this puts
 * plenty of pixels on a face.
 */
const FRAME_W = 480
const FRAME_H = 360
const TARGET_FPS = 24
const MIN_FRAME_MS = 1000 / TARGET_FPS

/**
 * If the socket backs up, drop frames instead of queueing them. An
 * unbounded queue would grow until the tab died, and stale frames are
 * worthless to a pulse estimator anyway — it wants recent skin, not a
 * backlog.
 */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024

/** uint16 width + uint16 height + float64 µs. Must match sidecar/server.js. */
const HEADER_BYTES = 12

export class PresageFrameSender {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private running = false
  private lastSentAt = 0
  private lastTsUs = 0
  private rafHandle = 0
  private vfcHandle = 0
  private watchdog: ReturnType<typeof setInterval> | null = null
  private header = new DataView(new ArrayBuffer(HEADER_BYTES))
  private packetBuf: ArrayBuffer | null = null
  private packet: Uint8Array | null = null
  private video: HTMLVideoElement
  private ws: WebSocket
  framesSent = 0
  framesDropped = 0

  constructor(video: HTMLVideoElement, ws: WebSocket) {
    this.video = video
    this.ws = ws
    this.canvas = document.createElement('canvas')
    this.canvas.width = FRAME_W
    this.canvas.height = FRAME_H
    // willReadFrequently tells the browser to keep this canvas backed by
    // software memory. Without it, every getImageData forces a GPU
    // readback stall, which shows up directly as dropped game frames.
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  }

  start() {
    if (this.running || !this.ctx) return
    this.running = true
    this.pump()

    // Watchdog. rVFC can also stop firing for reasons outside this loop —
    // a backgrounded tab, a camera track that drops — and because the
    // loop re-arms from inside its own callback, one missed callback ends
    // it silently and the pulse source is simply gone. Re-arm via rAF,
    // which always fires, rather than trusting it not to happen.
    this.watchdog = setInterval(() => {
      if (!this.running) return
      if (performance.now() - this.lastSentAt < 2000) return

      /**
       * SAY WHY NOTHING IS BEING SENT.
       *
       * The watchdog re-arms a dead pump, which is right, but it did so
       * silently — so a page that was connected to the sidecar and
       * capturing nothing looked, from every surface the player can see,
       * exactly like a page that was capturing fine and waiting for a
       * pulse. The sidecar could only report "connected but no frames",
       * which is the symptom, not the cause: only the browser knows
       * whether the video element has a picture in it.
       *
       * A video with no dimensions and a readyState below HAVE_CURRENT_DATA
       * has no stream attached, which after a successful getUserMedia
       * means the track ended or was taken by something else.
       */
      if (this.framesSent === 0 && (this.video.readyState < 2 || !this.video.videoWidth)) {
        useSensorStatus
          .getState()
          .setCameraError(
            'CAMERA NOT DELIVERING — permission was granted but no picture is arriving. ' +
              'Another tab or app may have taken it; close those and reload.',
          )
      }
      if (this.vfcHandle && typeof this.video.cancelVideoFrameCallback === 'function') {
        this.video.cancelVideoFrameCallback(this.vfcHandle)
        this.vfcHandle = 0
      }
      if (this.rafHandle) {
        cancelAnimationFrame(this.rafHandle)
        this.rafHandle = 0
      }
      this.pump()
    }, 2000)
  }

  stop() {
    this.running = false
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = null
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle)
    if (this.vfcHandle && typeof this.video.cancelVideoFrameCallback === 'function') {
      this.video.cancelVideoFrameCallback(this.vfcHandle)
    }
    this.rafHandle = 0
    this.vfcHandle = 0
  }

  /**
   * Drive off requestVideoFrameCallback ONCE THE VIDEO IS ACTUALLY
   * PLAYING, because it fires once per genuinely new camera frame.
   * requestAnimationFrame fires at display rate, so on a 60Hz screen with
   * a 30fps camera half the captured frames are byte-identical
   * duplicates — actively harmful, since rPPG reads colour change over
   * time and a repeated frame is a reading of "no change" that never
   * happened.
   *
   * But rVFC only ever fires if the video presents a frame, and this loop
   * re-arms itself from inside its own callback. Registering it against a
   * video that has no stream yet therefore kills the loop permanently —
   * which is exactly what happened: the socket opens in milliseconds
   * while getUserMedia takes hundreds plus a permission prompt, so the
   * sender armed against an empty video and the sidecar sat there
   * reporting "NO FRAMES arriving" forever.
   *
   * So: poll with rAF until the video has data, then switch to rVFC. rAF
   * keeps firing regardless of the video's state, so the loop can always
   * recover.
   */
  private pump = () => {
    if (!this.running) return
    const v = this.video
    const videoReady = v.readyState >= 2 && v.videoWidth > 0
    if (videoReady && typeof v.requestVideoFrameCallback === 'function') {
      this.vfcHandle = v.requestVideoFrameCallback(() => {
        this.capture()
        this.pump()
      })
    } else {
      this.rafHandle = requestAnimationFrame(() => {
        this.capture()
        this.pump()
      })
    }
  }

  private capture() {
    if (!this.ctx || this.ws.readyState !== WebSocket.OPEN) return

    const now = performance.now()
    if (now - this.lastSentAt < MIN_FRAME_MS) return

    // readyState < HAVE_CURRENT_DATA means there is no frame to draw yet;
    // drawing anyway yields a black rectangle, which Presage would read as
    // a very dark scene rather than as "not ready".
    if (this.video.readyState < 2 || !this.video.videoWidth) return

    if (this.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.framesDropped++
      return
    }

    this.lastSentAt = now

    try {
      this.ctx.drawImage(this.video, 0, 0, FRAME_W, FRAME_H)
      const img = this.ctx.getImageData(0, 0, FRAME_W, FRAME_H)

      // Microseconds, strictly increasing. The SDK rejects a timestamp that
      // doesn't advance (kNonMonotonicTimestamp), and performance.now() can
      // repeat when its resolution is coarsened for fingerprinting defence.
      let tsUs = Math.round(now * 1000)
      if (tsUs <= this.lastTsUs) tsUs = this.lastTsUs + 1
      this.lastTsUs = tsUs

      this.header.setUint16(0, FRAME_W, true)
      this.header.setUint16(2, FRAME_H, true)
      this.header.setFloat64(4, tsUs, true)
      const headerBytes = new Uint8Array(this.header.buffer as ArrayBuffer)

      // Allocated once and reused. A fresh 691KB buffer 24 times a second
      // is 16MB/s of garbage for the collector to chase, and GC pauses in
      // a horror game read to the player as the game stuttering.
      const total = HEADER_BYTES + img.data.length
      if (!this.packetBuf || this.packetBuf.byteLength !== total) {
        this.packetBuf = new ArrayBuffer(total)
        this.packet = new Uint8Array(this.packetBuf)
      }
      this.packet!.set(headerBytes, 0)
      this.packet!.set(img.data, HEADER_BYTES)

      this.ws.send(this.packetBuf)
      this.framesSent++
      // Publish roughly twice a second — the panel needs to show liveness,
      // not a per-frame counter, and a store write per frame would be 24
      // React updates a second for a number nobody reads that fast.
      if (this.framesSent % 12 === 0) {
        useSensorStatus.getState().setFrames(this.framesSent, this.framesDropped)
      }
      // Say so once. "Is it even sending?" was the whole question during
      // the first live test, and there was no way to answer it from the
      // browser side.
      if (this.framesSent === 1) console.info('[dread] sending camera frames to Presage sidecar')
    } catch {
      // A cross-origin or not-yet-ready video taints the canvas and makes
      // getImageData throw. The game must keep running regardless — pulse
      // falls back to the in-browser estimator.
      this.framesDropped++
    }
  }
}
