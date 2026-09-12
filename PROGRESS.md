# DREAD — progress ledger

HackRice 16. Games & Gamification track. Repo: https://github.com/leozh0u/dread

## Leo's vision — check every change against this

Written down because it's been stated across many messages and needs to
survive compaction. In his words where possible:

1. **A maze, "like the backrooms"** — not a hallway with boxes off it.
   Disorienting, repetitive-but-varied, real turns and choices.
2. **Eerie abandoned atmosphere** — "strange light sources and weird
   objects scattered around, but like actual objects, like desks,
   posters, drawings." Mundane furniture left behind, not story props.
3. **A simple, clear objective: escape.** "A door leading to safety that
   you have to find." No heavy narrative dressing on the collectibles —
   he explicitly rejected "actual products" like a photograph/journal.
4. **A monster that is actually frightening** — "it looks like Baymax"
   was the complaint. Must not read soft, round, or goofy. Needs weight,
   wrongness, real animation.
5. **Audio above all, and truly spatial** — "I need to really be able to
   hear where everything is and coming from where." Heavy monster
   footsteps in stereo, realistic footsteps/jump/landing for the player,
   sudden noises and scratching, real voices.
6. **Real stakes** — hide, avoid, escape; the monster patrols constantly.
7. **The biometric hook is the point**: real pulse + blink sensing off
   the webcam (Presage), driving when the monster pushes and retreats.
8. **Judges must be able to play it** — hosted, zero setup.
9. **No jank.** Movement always works, no phasing through walls, no dead
   ends in the UI where a screen traps you.

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

## Live build for judges

**https://leozh0u.github.io/dread/** — deployed via GitHub Actions
(`.github/workflows/deploy.yml`), redeploys automatically on every push to
main. Repo is now **public** (was private; GitHub Pages needs that on the
free plan — confirmed with Leo before flipping it). Runs entirely off the
in-browser rPPG fallback since the Presage sidecar isn't reachable from a
static host — same fallback path that already exists for local use.

## Open — in priority order

1. **Verify with Leo, live, on his machine:** audio audible from the
   start (fixed), pointer-lock/movement bugs (fixed), the new maze layout
   actually reads as a maze and not still-a-hallway (rebuilt this pass —
   real junction graph with a loop, see below), the monster looking
   "ominous" now (redesigned this pass — claws, spikes, asymmetric gait,
   backlight). All reasoned through and code/module-tested, none of it
   eyes-on with a real webcam and real ears yet.
2. **Video plan.** Never actually written despite being flagged as a task
   since early in the session ("video planning for later" — later is now).
   Needs a shot list against HackRice's prescribed structure (30s intro /
   2min demo / 30s technical / 30s impact).
2. **Presage on real hardware — untested.** The sidecar has never been run
   against a live camera or a real API key (this sandbox has neither).
   This is the single highest-risk unknown left: if it doesn't work on
   Leo's laptop, the fallback estimator carries the whole demo, which is
   noisier. Needs testing on Leo's actual machine ASAP, not the night
   before submission. **Leo is checking Discord/handbook for the key.**
   Also the honest limit on "accurate heart rate" right now — the
   in-browser fallback's accuracy ceiling is what it is; the real fix is
   this key, not more client-side rPPG tuning.
3. **Sponsor integrations not yet built** (mapped conceptually, no code):
   MathWorks (an autonomic HR/HRV model), ElevenLabs (voice lines layered
   on top of the procedural audio, see Done), Persona (identity gate),
   Backboard (cross-session memory — the bandit stats *do* persist across
   a restart right now, which is a start, but nothing calls the actual
   Backboard API), Tiger Data (pulse history isn't stored anywhere durable
   yet, just in-memory). **Leo is checking Discord/handbook for the
   ElevenLabs key too.**
4. **Leo's own recorded voice lines** — he floated recording his own
   lines and having them pitch-shifted/distorted, as an alternative to
   the generated voice line now in place (see Done below). Still open if
   he wants to actually do that instead/in addition — waiting on him to
   record and send audio.
5. **Jumpscares** — explicitly deferred by Leo ("we can add jumpscares
   later"); the existing probabilistic hidden+noisy+close jumpscare stays
   as-is, not being expanded right now.
6. **Ongoing standard, not a one-time item:** keep verifying claims by
   direct testing, not code review alone — every real bug found this
   session (Rapier sensors, door collision, and now the wall-phasing
   collider bug) looked completely correct on paper and was only caught
   by actually driving the player through it.

## Done — audio, visuals, hosting (this pass)

- [x] **Real procedural sound design, zero API keys needed.** Heartbeat
      that audibly "lub-dub"s in sync with the player's live bpm; a
      continuous monster growl bed that gets louder and tonally closer as
      it approaches; footsteps on movement; four distinct textured scare
      stingers (screech/stab/lunge/silence) instead of one generic tone;
      a harsher dedicated jumpscare sound. ElevenLabs, if the key turns
      up, layers voice lines on top of this later; the game was never
      blocked on it.
- [x] **Stereo/spatial audio.** The monster growl runs through a WebAudio
      PannerNode (HRTF) at its real world position, with the listener
      synced to the camera every frame — it actually pans/attenuates by
      where the thing is relative to where you're looking.
- [x] **Real 3D monster** — articulated torso/head/arms/legs, procedural
      lurch-walk, glowing eyes that brighten as it closes in, and a
      lunge-and-recoil attack animation tied directly to the Director's
      'proximity' scare events (not a black box anymore).
- [x] **Distinct hiding props** (closet/curtain/crate/table) and level
      dressing (swinging bulb, tilted frames, toppled chair) instead of
      identical translucent boxes and flat corridor walls.
- [x] **Real blink detection.** MediaPipe FaceLandmarker reads eye-closed
      state off the same webcam feed used for pulse; eyes shut past 3.5s
      triggers a whisper ("open your eyes") panned into a random ear —
      client-side, no API key, degrades silently if the model can't load.
- [x] **Hosted for judges** — see "Live build for judges" above.

All of the above verified by direct in-browser testing this pass (module
injection for audio functions, live FaceLandmarker creation with the real
CDN model, screenshot confirmation of monster position/animation) — not
code review alone, per the standing verification rule above.

## Done — map, monster AI, objective, wall-phasing fix (superseded below)

**Note:** the "bigger map" and "confined-to-corridor patrol" described in
this section were a single spine corridor with alcove rooms. Leo asked
for something actually maze-like ("like the backrooms") a few messages
later — see the next section below for the real rebuild. Keeping this
section rather than deleting it since the wall-phasing fix and the
dual-win-condition work described here are still current, just the map
shape itself moved on.

- [x] **Fixed a real wall-phasing bug.** Root cause: the player's collider
      was an auto-generated bounding sphere approximating its capsule
      mesh, which clipped corners at wall junctions. Replaced with an
      explicit CapsuleCollider matching the visual shape. Verified by
      holding movement into a flat wall and into a diagonal corner for
      5s+ via synthetic key events — position held stable at the wall
      face both times, no tunneling.
- [x] **Bigger map.** Corridor extended ~18 units, four alcove rooms
      instead of three, calm room deepened, per-segment wall tinting,
      tilted frames/toppled furniture/glowing floor chevrons so it isn't
      flat repeated corridor anymore.
- [x] **Real monster AI**, not a scripted slider. Confined to the
      corridor spine (rooms are now actually out of its reach, not just
      visually implied to be) — patrols back and forth continuously,
      cuts straight toward the player's real position on STALK/STRIKE,
      retreats along the corridor on WITHDRAW. monsterDistance is now
      *derived* from real distance each frame. Verified via a temporary
      debug hook: patrol position crept steadily toward its boundary in
      real time, confirmed it never idles.
- [x] **Heavy stereo monster footsteps + a breathing bed**, panned to its
      real position (reuses the existing HRTF PannerNode). Player's own
      footsteps got alternating L/R pan and a low thud for more presence.
- [x] **Two distinct win conditions** — run for the unlocked door
      ('escaped_door', fast) or reach the calm room and actually regulate
      your heart rate ('escaped_calm', slower, the "real" one) — instead
      of the door being just a gate in front of the only ending.
- [x] **Clue objects are labeled story items now** ("a child's
      photograph," in-world via drei's Html), not unlabeled glowing
      shapes — answers Leo's "what are those yellow diamond crystals?"
      directly. HUD also states the current objective in plain language.

## Done — real maze, monster redesign v2, real voice line (this pass)

- [x] **Real maze layout** (`maze.ts`) — a graph of junctions and
      corridors instead of one spine with alcoves. Real 90-degree turns,
      a genuine loop (two routes between the B and D junctions, so
      evading the monster is an actual option), dead ends. Walls and
      junction caps are generated from the graph rather than hand-placed,
      which is what made a level this size buildable correctly. Verified
      by walking the player through a real 90-degree turn and confirming
      it's correctly stopped by the generated cap on a junction's closed
      side.
  - [x] Monster now follows this graph via arc-length progress along the
        main loop + exit spur (`pointAtArcLength`/`projectToArcLength` in
        maze.ts) instead of a straight line — verified via direct
        function calls (round-trips correctly, wraps at the loop end,
        shortest-path delta picks the correct direction).
- [x] **Monster visual/animation redesign, grounded in actual
      horror-animation research** (asymmetric limb timing instead of a
      mirrored gait, unpredictable rhythm with hitches instead of a
      metronome, a too-far-forward lean, gaze that lags the body's own
      facing) — see the commit for sources. Added claws, spine spikes, an
      asymmetric head, a faint cold backlight (so it doesn't just vanish
      as black-on-black), and real facing rotation (it never turned to
      face its direction of travel before).
- [x] **Softer fog** — linear fog (hard cutoff at a fixed distance)
      swapped for exponential, which falls off as a curve instead of a
      wall.
- [x] **Random ambient horror stingers** (a creak, a scratch) on an
      unpredictable timer at a random point in the maze, deliberately
      independent of the monster's location — "something else is in
      here," real stakes/unpredictability per Leo's ask.
- [x] **Spatial audio tuned tighter** (lower refDistance, steeper
      rolloff) across the monster growl, footsteps, and the new stingers
      so directionality reads clearly rather than subtly.
- [x] **A real generated voice line for the blink-whisper**, replacing
      browser TTS. Checked the available audio-generation tool's
      constraints first: standalone use is text-to-speech only (sound
      effects/music are restricted to that tool's own game pipeline), so
      only the whisper line uses it — the creak/scratch stingers correctly
      stay procedural. Generated once via Higgsfield's seed_audio
      (slowed, pitched down), downloaded, committed as a static asset —
      no runtime API dependency, falls back to browser TTS if it can't
      load.

## Explicitly dropped (not forgotten, decided against)

- MIMIC (voice-cloning multiplayer concept) — dropped when Leo said no
  audio/mic-based multiplayer mechanics, too complex for the timeline
- Boxing/EMS shock game — dropped early (HackRice hardware win-rate
  research didn't support it, and EMS on a person at a public event is a
  liability)
- Fixed 90-second session timer — removed once the game became
  objective-driven (escape or die), since a clock cutoff mid-exploration
  fights the objective
