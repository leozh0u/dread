# DREAD — progress ledger

HackRice 16. Games & Gamification track. Repo: https://github.com/leozh0u/dread

## What DREAD is

A horror game that reads your pulse from your webcam and hunts your fear.
Escape a house by finding 3 clues while avoiding a monster that detects your
noise and visibility — then, in the final room, you have to lower your own
heart rate and hold it to open the last door. The impact claim (that this
demonstrates the same push/retreat loop used in real biofeedback and
exposure-therapy training) is now something the player has to *do* to win,
not just text on a screen.

## Done

- [x] Repo created, clean commits, pushed (`leozh0u/dread`)
- [x] Track locked: Games & Gamification (thinnest field at the event)
- [x] Concept locked: pulse-driven horror + stealth + calm-room finale
- [x] Presage sidecar code written (`sidecar/`) — confirmed the SDK loads
      natively on this machine; **never tested against a real API key**
      (see Open, below)
- [x] In-browser rPPG fallback estimator, so the game never goes fully dark
      if the sidecar dies mid-demo
- [x] Pulse smoothing (clamp + EMA) — fixed the jittery bpm readout
- [x] Real level: spine corridor + 3 alcove rooms + locked door + calm room
- [x] First-person controller (custom, not a library — see README/commit
      history for why ecctrl was wrong here)
- [x] Flashlight lighting fixed (physically-correct lighting units bug —
      intensity 8 was invisible, needed ~2500)
- [x] Stealth/death system: exposed-near-monster kills fast, noisy-while-
      hidden kills slower, hidden+quiet is always safe
- [x] Real microphone noise detection (Web Audio RMS)
- [x] Clue pickups, hiding spots, calm room — all working via distance
      checks (see below for why, not Rapier sensors)
- [x] Calm-room finale: sustained heart rate near baseline for 8s → escape
- [x] Fear-curve end screen with exposure-therapy framing, hedged honestly
- [x] Restart flow ("PLAY AGAIN") — verified working via real UI click,
      not just code review
- [x] Two serious bugs found AND fixed via direct testing, not assumption:
      Rapier sensor colliders never fired (rewrote to distance checks);
      the exit door didn't physically block the player (isolated collider
      fix)

## Open — in priority order

1. **Audio.** Only placeholder WebAudio tones exist (a drone + oscillator
   stingers). Leo asked explicitly for "incredibly immersive" sound. This
   is the single biggest gap between what's built and what's needed.
   Needs either ElevenLabs (sound design + a voice) or pasted audio assets
   — **waiting on Leo** for an API key or files.
2. **Visuals.** Monster is still a black box placeholder. Level geometry
   is blocky (deliberately, for scope — darkness/fog hides it — but the
   monster itself needs at least a silhouette, ideally a cheap rigged
   Mixamo model).
3. **Video plan.** Never actually written despite being flagged as a task
   since early in the session ("video planning for later" — later is now).
   Needs a shot list against HackRice's prescribed structure (30s intro /
   2min demo / 30s technical / 30s impact).
4. **Presage on real hardware — untested.** The sidecar has never been run
   against a live camera or a real API key (this sandbox has neither).
   This is the single highest-risk unknown left: if it doesn't work on
   Leo's laptop, the fallback estimator carries the whole demo, which is
   noisier. Needs testing on Leo's actual machine ASAP, not the night
   before submission.
5. **Sponsor integrations not yet built** (mapped conceptually, no code):
   MathWorks (an autonomic HR/HRV model), ElevenLabs (audio, see #1),
   Persona (identity gate), Backboard (cross-session memory — the bandit
   stats *do* persist across a restart right now, which is a start, but
   nothing calls the actual Backboard API), Tiger Data (pulse history
   isn't stored anywhere durable yet, just in-memory).
6. **Ongoing standard, not a one-time item:** keep verifying claims by
   direct testing, not code review alone — this session's two real bugs
   (sensors, door collision) both looked completely correct on paper and
   were only caught by actually driving the player through them.

## Explicitly dropped (not forgotten, decided against)

- MIMIC (voice-cloning multiplayer concept) — dropped when Leo said no
  audio/mic-based multiplayer mechanics, too complex for the timeline
- Boxing/EMS shock game — dropped early (HackRice hardware win-rate
  research didn't support it, and EMS on a person at a public event is a
  liability)
- Fixed 90-second session timer — removed once the game became
  objective-driven (escape or die), since a clock cutoff mid-exploration
  fights the objective
