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

## Demo video plan — `VIDEO.md`

Written and committed. Full shot list against HackRice's prescribed
30s/2min/30s/30s structure, with the two genuinely differentiating beats
flagged as priorities (finding the monster by ear; the Director visibly
backing off when the player spikes), production notes, and a
pre-submission checklist. **This was the oldest open item in the entire
session** — flagged since the first hour, finally closed.

## Live build for judges

**https://leozh0u.github.io/dread/** — deployed via GitHub Actions
(`.github/workflows/deploy.yml`), redeploys automatically on every push to
main. Repo is now **public** (was private; GitHub Pages needs that on the
free plan — confirmed with Leo before flipping it). Runs entirely off the
in-browser rPPG fallback since the Presage sidecar isn't reachable from a
static host — same fallback path that already exists for local use.

## Open — in priority order

1. **NOBODY HAS EVER PLAYED A RUN END TO END.** Still true, and still
   the top risk — but the level itself is now *proved* completable
   rather than assumed. `npm run test:level` builds the real collision
   geometry and flood-fills from spawn at the player's capsule radius.
   It found two genuine bugs on its first run, both room openings cut in
   the wrong wall: the G-H alcove and the M-N branch room were each
   sealed shut, and each gap opened into the void between corridors —
   the player could literally walk out of the level. Both fixed; the
   level is now verified sealed with all fragments and hiding spots
   reachable, and door gating verified in both states.
   What that test CANNOT prove: that it feels right, that the monster
   doesn't trap you, that the endings fire in play. Still needs a human.
   Dev keys make it fast: **C** skips calibration, **K** grants all
   fragments, **J** does both.
2. **Presage — FIXED, needs one real-face confirmation from Leo.**
   Root cause was two bugs masking each other: the sidecar called
   `useCamera()`, which captures in the sidecar's own process, and a Node
   process launched from a terminal has no macOS camera grant — so
   AVFoundation opened the device, warned about focus/exposure locking,
   and then delivered *zero frames*, silently (measured: 0 frames, 0
   validation events in 20s, status stuck on kStarting). Separately the
   protobuf metrics payload was never decoded, so it would have reported
   nothing even with perfect frames.
   Now the **browser** captures and pushes frames over the WebSocket
   (`src/lib/presageBridge.ts`); it already owns the camera and already
   has permission. Verified end to end with synthetic frames:
   kStarting -> **kRunning**, ~20fps sustained, SDK correctly reports
   kNoFaceFound for noise. Only a real face is untested.
   Fallback is no longer all-or-nothing: if the sidecar connects but
   stays silent 35s, or goes quiet mid-run, in-browser rPPG resumes
   automatically — important because motion corrupts rPPG and the player
   moves most right after a scare.
3. **Shoot the video Saturday evening**, not Sunday morning. Shot list is
   in VIDEO.md. Use **J** so it doesn't open on 60s of calibration.
4. **MATLAB** — script is written (matlab/autonomic_model.m), Leo runs it
   once; the game already works without it via a documented fallback.
5. **Sponsors — see SPONSORS.md for exact steps.** Persona and Backboard
   are both CODED and pushed; each is waiting on values only Leo can get
   from a dashboard.
   - **Persona** (highest value — no prior art at any hackathon): needs a
     sandbox `itmpl_…`, `env_…`, and API key. Template/environment ids
     are publishable by design and ship in the bundle; the API key is
     sidecar-only. Start screen shows "PROVE YOU ARE ALIVE" once
     configured, always with a visible skip, and stays as plain BEGIN
     until then — so not doing it cannot break anything.
   - **Backboard**: DONE end to end. The Director's bandit (which learns
     which of four scare types spikes this player) is now persisted
     between sessions and the player is told — "The house has met you 3
     times. It remembers the audio." Proxied through the sidecar since
     Backboard has no publishable key. Needs only `BACKBOARD_API_KEY` and
     `BACKBOARD_ASSISTANT_ID` in `.env.local` (curl command in
     SPONSORS.md) — untested against the live API, only against mocked
     responses.
   - **Tiger Data**: DONE. Pulse trace streams to a TimescaleDB
     hypertable via the sidecar (a connection string carries a password,
     so it can never ship). Needs only `TIGERDATA_URL` in `.env.local`.
     Untested against a live database — only against the no-database
     degradation path.
   - **All four integrations fail soft.** No sidecar, no keys, no
     network: the game plays exactly as it does now. That is deliberate,
     because judges will run the hosted build with none of it.
6. **Creature design still not signed off.** Rebuilt with connected
   skeletons and shaded materials after Leo's screenshots showed floating
   parts and flat cardboard shapes. Press **M** to inspect.
7. **Jumpscares** — explicitly deferred by Leo.
8. **Blink/face sensing now drives the Director** (vision item 7, open
   since the first day and never previously mentioned). Blink->whisper
   was already done; blink->Director was not — the Director ran purely on
   pulse and never read `confidence`. Now a startle channel off MediaPipe
   blendshapes scores scares in 100-300ms, and when pulse confidence
   collapses (which happens *because* the player jumped) the bandit
   learns from the face instead of from a corrupted reading. This is the
   two-clock design from the plan, and it's the honest answer to a
   judge's "what was hard?".
9. **`npm test` now exists.** `test:level` (flood-fills the
   real collision geometry), `test:run` (walks a full playthrough and
   both endings), `test:memory` (parses hostile Backboard responses).
   Run it before filming and before submitting.
9. **Ongoing standard:** verify by direct testing. Traps hit repeatedly
   this session: reading state via dynamic `import()` in the console can
   resolve to a DUPLICATE module and report stale values (three false
   "it's broken" conclusions); and a black screen with no HUD is a React
   crash, not a game state — there's now an error boundary that says so.


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

## Done — Backrooms aesthetic pass, calibration-death fix (this pass)

- [x] **Fixed the repeated "Not enough data captured this run." dead
      end** — two real bugs: (1) MONSTER_PATH included junction A, the
      spawn nook, so the creature walked straight to the player at start;
      (2) neither death nor the door-win was gated on the session having
      started, so dying during the 60s calibration set an outcome while
      `startedAt` was still null — exactly the state that renders that
      empty screen. Patrol now starts at B; both outcomes gated.
- [x] **Enter/Space restarts on the end screen** (and the button says
      so), so a pointer-lock release that fails or lags can never strand
      the player behind an unclickable button.
- [x] **Monster geometry rebuilt angular** — every capsule and sphere
      replaced with flat-shaded low-poly forms (faceted torso, octahedron
      shard head, tapered 5-sided limbs with box joints, jutting ribs,
      slit eyes). Capsules/spheres are literally the soft-robot shape
      language, which is why the old one read as Baymax.
- [x] **Press M = inspect mode** — parks the creature lit in front of the
      player. Added because the sandbox browser here renders no WebGL at
      all (verified: an unlit test cube 3m from the camera is invisible
      while the GL context reports healthy), so the monster's look cannot
      be checked from this side. Leo can judge it in one keypress.
- [x] **Backrooms aesthetic rebuild, research-led** (sources in commit):
      added a ceiling (there was none — a big reason it read as a void),
      dropped it to office height 3.2, mono-yellow palette across
      walls/floor/ceiling, ~35 fluorescent fixtures assigned
      steady/flicker/dead, fog tinted to the room's own yellow instead of
      black (fixes the "harsh black cutoff" directly). Fluorescents are
      the primary light source now; flashlight is supporting.
  - Lighting performance handled deliberately: 35 real point lights would
    blow the shader uniform budget, so tubes are emissive meshes and a
    pool of 4 point lights is re-pointed each frame at the nearest
    fixtures — constant light count, no shader recompiles.
- [x] **Audio**: fluorescent mains hum (120Hz + harmonics, detuned so it
      beats against itself) and convolution reverb from a procedurally
      generated impulse response, with positioned sounds sending into it.
- [x] **Clues de-narrativised** — abstract shards again, no floating
      world labels, no "a child's photograph" framing. Decorative props
      (desks, drawings, posters, broken lights) carry the atmosphere
      instead, which is what was actually wanted.

## Explicitly dropped (not forgotten, decided against)

- MIMIC (voice-cloning multiplayer concept) — dropped when Leo said no
  audio/mic-based multiplayer mechanics, too complex for the timeline
- Boxing/EMS shock game — dropped early (HackRice hardware win-rate
  research didn't support it, and EMS on a person at a public event is a
  liability)
- Fixed 90-second session timer — removed once the game became
  objective-driven (escape or die), since a clock cutoff mid-exploration
  fights the objective
