# DREAD

**A horror game that reads your pulse from your webcam and hunts your fear.**

Play it: https://leozh0u.github.io/dread/ · headphones, and let it see your face

Built for HackRice 16 · Games & Gamification track

---

## The idea

Most horror games escalate on a script or a timer. DREAD escalates on *you*.

Your webcam reads your pulse (via [Presage](https://presagetech.com)'s SmartSpectra SDK — no
wearable, no wristband). The house watches your heart rate against your own calm baseline:

- **Calm → it comes closer.** Footsteps. A door left open. Something at the edge of the flashlight.
- **Terrified → it backs off.** Total silence. Nothing. It's not being merciful — it's waiting for
  you to relax, so it can hit you again in the recovery.

A small bandit algorithm tracks which *kind* of scare (proximity, audio, visual, or dead silence)
spikes your pulse hardest, and leans toward it as the session goes on. It's not a trained model —
with ~20 data points in a single play session, a multi-armed bandit is the right tool, not an
excuse.

**That's the design. What shipped is not all of it:** the Presage pulse never arrived, so the build
you can play runs an in-browser estimator, or nothing at all, and is playable either way. The whole
story is in [Status, honestly](#status-honestly) below, including why it failed.

Related prior art: [*Nevermind*](https://www.pcgamer.com/nevermind-the-biofeedback-enhanced-horror-game-is-now-on-steam/)
(2015) proved biofeedback horror works, but needed a chest-strap heart rate monitor. DREAD runs on
the camera already built into your laptop.

## What this demonstrates, and what it doesn't claim

The Director's core loop — escalate when calm, withdraw when overwhelmed, strike into the recovery
— is structurally the same logic clinicians use in graded exposure therapy: hold someone at the
edge of what they can tolerate, not past it. We think that's a genuinely interesting result of
building a scary game honestly. **We are not claiming this treats phobias.** VR exposure therapy
has real meta-analytic support against in-vivo exposure; nobody has run that comparison for
flat-screen, camera-only sensing, so we don't claim it either. What we *are* showing: the sensing
and control loop that used to need a $1,500+ chest-strap rig now runs on a laptop's built-in
camera.

We also want to name a real limitation up front rather than bury it: remote photoplethysmography
(the technique behind Presage and every camera-based pulse sensor) has documented accuracy
disparities across skin tones, because darker skin reflects less light in the wavelength band the
signal lives in. It's a known, published limitation of the whole sensing category, not something
we introduced — but it's real, and any product built on this needs to account for it before it's
anything more than a hackathon demo.

## Architecture

```
dread/
├── src/                    the game (Vite + React + Three.js/R3F)
│   ├── game/
│   │   ├── Scene.tsx        3D scene: flashlight, corridor, monster, post-fx
│   │   ├── director.ts      the Director state machine + scare-selection bandit
│   │   └── useDirectorLoop.ts  wires live pulse → Director phase transitions
│   ├── lib/
│   │   ├── usePulse.ts      unified pulse pipeline (prefers sidecar, auto-fails-over)
│   │   └── fallbackPulse.ts naive in-browser rPPG — the failsafe, see below
│   └── components/
│       ├── Webcam.tsx        camera capture, feeds the pulse pipeline
│       └── Hud.tsx           debug/atmosphere pulse + phase readout
└── sidecar/                 separate Node process, NOT bundled into the game
    └── server.js             runs Presage SmartSpectra, broadcasts pulse over WS
```

**Why the sidecar is a separate process:** Presage's Node SDK needs Node ≥20 and a native runtime
per platform. Keeping it out of the Vite/browser bundle means the game itself stays a normal web
app — deployable anywhere (see Vultr, below) — and if the sidecar ever dies mid-demo, the game
doesn't go dark. `usePulse.ts` tries the sidecar over WebSocket first; if it doesn't answer within
~2.5s, or the connection drops, it fails over automatically to `fallbackPulse.ts` — a from-scratch
green-channel rPPG estimator that runs entirely in the browser off the same webcam feed. That
failsafe exists for exactly one reason: **live judging happens 3–4 times, cold, in a loud room, and
this project should never be one dead API key away from a blank screen.**

## Running it

**Game:**
```bash
npm install
npm run dev
```

**Pulse sidecar** (optional — the game runs on the fallback estimator without it):
```bash
cd sidecar
npm install
cp .env.example .env   # add a free key from physiology.presagetech.com
npm start
```

## Status, honestly

**The pulse sensing never worked, and the reason is worth writing down.**

Presage's SDK ships the face and pose models in the package, but the cardiac
model is delivered from their servers at runtime, gated on the API key, and that
delivery never succeeded on our key. Everything downstream of it behaved exactly
as you would expect from that: face tracking worked, framing validation gave
real specific feedback, the graph reached `kRunning`, and the pulse was null
forever. It was never a lighting problem and never a framing problem. Sitting
still was never going to fix it, and `SmartSpectraOptions` exposes no model path
override, so it could not be pointed at a local file from our side either.

So the game falls back. `fallbackPulse.ts` is a from-scratch green-channel rPPG
estimator that runs in the browser off the same webcam feed, and
`sensorless.ts` handles the case where no reading ever arrives at all: the house
says it cannot see you, and the Director runs on its own timing instead. **The
deployed build is playable either way**, which was the point of building the
failsafe before the sensor.

**What did get built:** a generated house with a maze, clues and a sealed exit;
a Director state machine with a scare-selection bandit; threat and ambient
loops; blink detection through MediaPipe; twenty ElevenLabs sound effects
wired through a bank; a calm room; house memory that persists between runs; and
an autonomic arousal model solved in MATLAB and shipped as an interpolated
lookup table (`matlab/autonomic_model.m` to `src/game/arousalTable.json`), so
nothing in the live demo depends on MATLAB running.

There are fourteen test scripts covering the level, the nav mesh, the geometry,
the threat loop, the Director, the ambient audio, the startle logic, the ROI,
the calm room, house memory and the bundle secret scan.

## Stack

React · TypeScript · Vite · Three.js / React Three Fiber · Rapier (physics) · Zustand · Howler ·
MediaPipe Tasks Vision (blink detection) · ElevenLabs (sound design) · MATLAB (autonomic model,
solved offline and shipped as a lookup table) · Presage SmartSpectra (pulse sensing, in the sidecar)
· TigerData/Postgres (the pulse trace, in the sidecar)

---

*Built at HackRice 16, Rice University.*
