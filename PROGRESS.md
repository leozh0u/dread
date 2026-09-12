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

0a. **OVERNIGHT PASS (2026-09-12 02:00-04:00), all pushed.** Fixed while
   Leo slept, each found by reading or testing rather than playing:
   detection ignored line of sight (dying through walls); the crawler
   hunted at 4.4 vs the player's 4.0, so chases were unwinnable — now
   enforced in code via an exported PLAYER_SPEED; all three creatures
   hunted at once (dogpile) — now only the closest; restart left the
   killer standing on the spawn (death loop); **calibration had no
   timeout, so a denied camera meant the game NEVER STARTED** — a judge
   would just close the tab; no fall-through recovery; audio never
   resumed after a tab switch; hiding props, fragments and the exit door
   were ALL floating 0.9 above the floor like the walls. Test suite now
   129 checks incl. nav, threat fairness, geometry alignment, secrets.
   Devpost copy drafted in DEVPOST.md.

0b. **CREATURE VISUAL DETAIL — STILL OPEN, raised THREE times.**
   "still ugly", then "bland, not complex in design, texture,
   colouring/shading", then "still very bland, no details". Each time I
   have addressed something adjacent (connectivity, then shading, then
   gait and shadows) rather than surface detail itself. This is the
   oldest repeatedly-unaddressed item in the project and should be
   treated as the one most at risk.

0. **FIRST REAL PLAYTHROUGH HAPPENED (2026-09-12 ~02:00).** Leo played.
   It found five things no test could have:
   - **Every wall floated 0.9 above the floor** — floor top is -0.9, walls
     spanned 0..3.2. Two implicit numbers that had to agree and didn't.
     FIXED; walls now derive from the floor/ceiling slabs.
   - **Monsters could never reach him** — they were locked to the patrol
     polyline and, even hunting, only moved to where he *projected* onto
     it. Standing in any room made him unreachable, so nothing ever
     detected or killed him. FIXED with real navigation (`nav.ts`, BFS
     distance field from the player, shared by all three).
   - **They glided** — the tall one had no leg animation at all and the
     crawler's was driven by a boolean. FIXED; gait is driven by real
     metres/second.
   - **Walk-through furniture.** FIXED; each prop is solid in the shape it
     should be, with the closet open-fronted so it stays hideable.
   - **"Not heading towards sound"** — FIXED; creatures now hunt on sight
     (wall-blocked), on sound (through walls, longer range), or on a
     Director STRIKE, with 6s of memory after losing you.
   Also from his follow-ups: **geometric audio occlusion** (was
   distance-only — a creature behind a wall sounded identical to one in
   your corridor), and a **live vitals panel** so the biometric stack is
   no longer invisible when it fails.

1. **STILL NOBODY HAS FINISHED A RUN END TO END.** Still true, and still
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
4. **MATLAB — OPEN, 30 seconds of Leo's time, still unclaimed.**
   `matlab/autonomic_model.m` exists but has NEVER been run, so
   `src/game/arousalTable.json` does not exist and the game is silently
   using the HR-only fallback. Open MATLAB in the `matlab/` folder and
   run `autonomic_model`. Until that file exists the MathWorks claim is a
   script nobody executed.
5. **Sponsors — see SPONSORS.md for exact steps.** Persona and Backboard
   are both CODED and pushed; each is waiting on values only Leo can get
   from a dashboard.
   - **Persona** (highest value — no prior art at any hackathon): needs a
     sandbox `itmpl_…`, `env_…`, and API key. Template/environment ids
     are publishable by design and ship in the bundle; the API key is
     sidecar-only. Start screen shows "PROVE YOU ARE ALIVE" once
     configured, always with a visible skip, and stays as plain BEGIN
     until then — so not doing it cannot break anything.
   - **Backboard**: DONE and **verified against the live API**
     (2026-09-12 ~06:30) — write returned 201, recall returned the memory
     with priors intact, and the real parser handled the real response
     (bestArm -> audio, as encoded). Test memory deleted afterwards. The Director's bandit (which learns
     which of four scare types spikes this player) is now persisted
     between sessions and the player is told — "The house has met you 3
     times. It remembers the audio." Proxied through the sidecar since
     Backboard has no publishable key. Needs only `BACKBOARD_API_KEY` and
     `BACKBOARD_ASSISTANT_ID` in `.env.local` (curl command in
     SPONSORS.md) — untested against the live API, only against mocked
     responses.
   - **Tiger Data**: DONE and **verified against Leo's live instance**.
     Two real bugs to get there: Timescale signs with their own private
     CA (pinned in sidecar/timescale-ca.pem, verification kept ON, which
     is stronger than the `sslmode=require` their string asks for), and
     node-postgres parses `sslmode` out of a connection string and
     silently overrode the ssl config — fixed by passing components
     explicitly. The end screen now shows past runs: "It got 8 bpm
     further into you than last time."
   - **Persona**: BLOCKED, needs Leo. Only `PERSONA_API_KEY` is in
     `.env.local`; `VITE_PERSONA_TEMPLATE_ID` and
     `VITE_PERSONA_ENVIRONMENT_ID` are still missing, so the gate does
     not appear at all (livenessConfigured() is false). The key also gets
     "Must be authenticated to access this endpoint" from Persona's API —
     likely the wrong key type or wrong environment. Deprioritised by Leo
     in favour of the biometrics; see SPONSORS.md.
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

---

## LEDGER — Saturday 12 Sept, midday session

Written down because this session has taken four separate mid-turn
requests from Leo and the oldest ones are the ones that get lost.

| # | What he asked, his words | State |
|---|---|---|
| 1 | "the monsters were still very bland, no details" (raised 4x) | **open** — heads rebuilt, root cause of the paleness found (see below), teeth still wrong |
| 2 | "trackpad panning... making my camera rotate rather than pan" | **done** — camera euler order, commit 565b436 |
| 3 | "can you get the presage to work. is it meant to be able to work" | **open** |
| 4 | "the walking animation of the monsters phases through the walls" | **open** |
| 5 | "you should try to make more sudden scary movements too" | **open** |
| 6 | 66 commits carry Claude co-author trailers in a public repo | **blocked on Leo** — history rewrite needs his say-so |
| 7 | Four API keys were exposed in chat and need rotating | **blocked on Leo** — ELEVENLABS, PRESAGE, BACKBOARD, TIGERDATA |

### Sponsor status as of this session — all four confirmed live

Ran the sidecar and hit it directly:
`persona=ready backboard=ready tigerdata=ready`, Presage waiting on frames.

- **Persona now authenticates.** `GET /api/v1/inquiries` returns 200 on the
  key in `.env.local`. The server-side confirm path is correct in both
  directions: a real but unfinished inquiry returns
  `{verified:false,status:"created"}`, a made-up id returns
  `{verified:false,reason:"persona 404"}`. The browser's own onComplete is
  client-reported and therefore spoofable on a static site; only the
  sidecar, holding the key, can actually confirm one. That distinction is
  the Persona story for the writeup.
- Leo has **started** an inquiry (inq_AwWY…, 16:03Z) but never finished
  it, so nothing has been verified end to end yet. He has to complete a
  real one himself — it is his ID.

### Root cause found for "everything looks pale and bland"

The creatures' limbs are `FLESH` = `#3a332b`, a dark brown. On screen at
5 metres they render as pale cream. That is a ~13x gain: the flashlight
(`intensity={520}`, `decay` 2) saturates every material inside about ten
metres, so creature, wall and floor all clip to the same washed-out tone
and there is no tonal separation left to read detail from.

This is why four rounds of "add more detail to the creatures" did not
work. The detail is there; the exposure is destroying it.

Same class of mistake as the near-black materials before it, in the
opposite direction — and inspect mode was hiding it, because it staged
the creatures under an intensity-30 flood against an unlit near-white
backdrop. Pressing M showed a creature no player would ever see. That
staging is now a dim fill over a real wall tone, lit by the player's own
torch, so the review tool shows the shipped thing.

### Ledger update — end of midday session

| # | Item | State |
|---|---|---|
| 1 | creatures bland | **substantially reworked, not signed off** |
| 2 | trackpad rotate-not-pan | done (565b436) |
| 3 | make Presage work | **pipeline proven; blocked on Leo's camera** |
| 4 | limbs phase through walls | done (872bce8) |
| 5 | sudden scary movements | done (7242f15) |
| 6 | Claude co-author trailers x66 | blocked on Leo |
| 7 | rotate 4 exposed keys | blocked on Leo |
| 8 | nobody has played a full run | **still true** |

### Presage: it works. It has never seen a face.

Proven end to end by streaming synthetic frames into the sidecar over the
same WebSocket protocol the browser uses: transport connects, frame
source is claimed, status goes kStarting -> kRunning, and the SDK runs
face validation and correctly reports "no face detected" on noise. The
only missing ingredient has always been a real face in front of a real
camera.

Leo's camera never turns on — no green light. Three fixes shipped so the
next person to hit this is told which of the causes it is:
- start-screen pre-flight on the click, so the prompt appears at a
  deliberate moment and a failure lands on a full page with room to
  explain
- Permissions API queried on mount, so a permission denied on an earlier
  visit is stated before anything is clicked
- Presage's own per-frame validation (kTooDark, kNoFaceFound, kFaceTooFar
  ...) now broadcast to the browser and shown in the vitals panel. It was
  previously printed only to the sidecar's terminal — the component that
  knew exactly why there was no pulse was invisible to the only person
  who could act on it.

kTooDark is the most likely failure at judging, in a room we did not
light. "TOO DARK — put a lamp on your face" recovers; an empty readout
just looks broken.

### `npx tsc --noEmit` was checking zero files

The root tsconfig is a solution file with an empty `files` array, so the
bare invocation resolves it, finds nothing, and exits 0. Every typecheck
run against it this session was vacuous — confirmed by planting a
deliberate type error and watching it pass. `tsc -b` is the real check
and immediately caught a live bug (indexing the {x,y,z} player store as
`player[0]`, which would have put NaN into a facing angle).

There is now an `npm run typecheck`, and `npm test` runs it first.

### Tiger Data verified, and cleaned

Full round trip confirmed: batched insert, per-run aggregation
(peak/mean/baseline via GROUP BY), and `time_bucket('1 second', …)`
downsampling with events attached. The test rows this produced were
deleted afterwards — the table is empty again, which incidentally
confirms no real run has ever written a trace.

### ElevenLabs audio checked for duplicates

Several MP3s share a byte size exactly, which usually means a generation
script wrote the same clip under several names. Checksummed all 19: every
one is distinct. The matching sizes are just equal durations at constant
bitrate.

---

## The automated playthrough, and the three bugs it found

"Nobody has played a full run end to end" was the oldest item on the
pre-submission list and kept staying open, because a run costs sixty
seconds of calibration plus a traverse of eighty units of maze — minutes
per attempt by hand, so it never got done. The endings were therefore the
least-exercised part of the game.

So: a dev bridge (`src/game/devBridge.ts`, compiled out of production
builds) exposes the camera, the navigation field and the stores, and an
injected script drives the REAL controls through the REAL maze. It
deliberately exposes primitives rather than a "win the game" button — an
autopilot that walks the maze and trips the real triggers is evidence; one
that sets `outcome='escaped_door'` is evidence of nothing.

It died at the spawn point before taking a step. Everything below came out
of chasing that.

**Both endings and all hiding were unreachable.** Trigger volumes span
y ∈ [0,3], from when the floor was at y=0. The floor is at -0.9 and the
player's tracked position is their capsule centre at -0.15 — below every
box. You could collect all three fragments, open the door, walk out, and
nothing happened. Hiding never registered either.

**The player could die at spawn without moving.** The position store
started at the world origin rather than the spawn; creatures mounted six
metres from that origin, inside the seven-metre kill radius; detection
filled at 8/tick against someone standing still thirty-five metres away.
2.5 seconds to death.

**Fragments had a 62cm effective pickup radius**, because 0.65 of the
0.9 budget was spent on a permanent vertical gap.

### The test was the reason all three survived

`scripts/fullrun.ts` walks a player through these regions and passed the
whole time. It placed them at y=0.5 — the height the *fragments* sit at,
and one the running game never produces. The vertical term was zero in the
test and 0.65 in reality.

A test fed numbers the system does not produce will confirm whatever you
already believed. It now walks at the real tracked height and has explicit
coverage that each hiding spot registers when stood in and stops when
stepped out of. 142 checks.

### Still open

- **Trackpad "rotate not pan" — reported again, and I cannot reproduce
  it.** The euler-order fix is live and verified in the running page
  (`order: 'YXZ'`, roll measured at 0.003°). Nothing else in the codebase
  writes camera roll, and there is no CSS transform on the canvas. Needs
  Leo to say which gesture and what exactly moves.
- Creature art: reworked, not signed off.
- Presage: pipeline proven, blocked on Leo's camera.
- 66 Claude co-author trailers; four keys to rotate. Both need Leo.
- MathWorks: still unclaimed, ~30 seconds of Leo's time.

---

## Saturday afternoon — the autonomous stretch

Leo went to eat with "full reign… run an agentic loop… make everything
better… no mistakes, be detailed, in depth, thorough", plus: darker and
scarier, monsters quicker/jitterier, more detail/colour/texture/eyes,
smoother movement, no phasing, market the product, and have the main
selling features ready to demo when he's back.

### Bugs found and fixed, in order of severity

1. **The game could not be finished.** Every trigger volume spanned
   y ∈ [0,3], from when the floor was at y=0. The floor is at -0.9 and
   the player's tracked position is their capsule centre at -0.15 — below
   all of them. Both endings and all hiding were unreachable.
2. **The player could die at spawn without moving.** The position store
   started at the world origin; creatures mounted six metres from it,
   inside the seven-metre kill radius.
3. **Fragments had a 62cm effective pickup radius**, because 0.65 of the
   0.9 budget went on a permanent vertical gap.
4. **`npx tsc --noEmit` was checking zero files** all session.
5. **STRIKE existed for zero frames** — set and overwritten in one
   synchronous block, so the creatures could never act on it and the
   readout never showed it.
6. **Two screens you could not get past** on a short window: the start
   screen's BEGIN and the end screen's PLAY AGAIN, both below the fold
   with no scrolling.
7. **A dead-end session state** (`outcome: died` + `session: playing`)
   reachable through the dev keys — the keys used for filming.
8. **The fallback pulse estimator invented heart rates from noise**, and
   lighting drift made it report 45 bpm for a clean 84 bpm signal.

### The pattern in most of them

Four separate bugs came from the same place: **a test that fed the system
numbers the system never produces.** `scripts/fullrun.ts` walked the
player at y=0.5 — the height the fragments sit at, never the height the
player is — and so confirmed pickups, endings and hiding all worked while
every one of them was broken in the running game.

The fix that mattered was not any individual patch; it was walking the
player at their real tracked height and watching three checks fail
immediately.

### Testing added

`npm test` now runs a real typecheck first, then 183 checks:
- `pulsetest.ts` — the rPPG estimator against synthetic signals with known
  answers: rate recovery, noise at twice signal amplitude, lighting drift,
  frame jitter and drops, the harmonic trap, and refusal cases swept over
  40 seeds
- `calmtest.ts` — the calm-room ending, which the entire impact claim
  rests on and had never been exercised
- the inversion, in `directortest.ts` — including that a permanently calm
  player gets a paced cycle and a permanently frightened one is never
  struck at
- hiding coverage in `fullrun.ts`, at the real player height

### Not reproducible

Leo reported the trackpad "rotating rather than panning" twice, then
clarified: *"everything is upside down."* The euler-order fix is live and
verified in the running page (order YXZ, roll measured at 0.003°). The
pitch clamp landing exactly on the YXZ singularity is a real degenerate
case and is fixed, and Player.tsx now self-rights every frame so an
upside-down camera cannot persist. But a full 180° flip could not be
reproduced in simulation. **If it recurs, the cause is still unfound.**

### A full run, verified in the real browser

Not headlessly — in the actual engine, driving the actual controls.

```
doorOpen=true
approach reached 24.3s
through the door reached 1.5s
outcome: escaped_door
```

That closes the oldest item on the list. It confirms the whole chain:
navigation through the maze, fragments collecting at the player's real
height, the door unlocking on the third, the door's collider genuinely
becoming passable (it switches to a sensor when unlocked), and the escape
ending firing when the player walks out.

An earlier run confirmed the other half: fragments collected at 2.8s and
12.7s, then a creature hunted the player down and killed them on the way
to the third. That is the correct outcome for a harness that walks in
straight lines and never hides, and it is the first time the creatures
have been shown to actually find and catch a moving player.

Also checked directly, because it was the likeliest reason for a bad first
impression: **the creatures do not camp the spawn.** Sampled every second
from the start of a run, all three sit 20m+ away with detection at zero
and walk their patrols. The fast deaths were the harness walking into
them.

Two things learned about the harness rather than the game:
- `navStepToward` is built on the grid padded by the CREATURE radius, so
  it cannot route into the tight alcoves a player fits through. Fleeing to
  a hiding spot jammed on a wall.
- The nav grid keeps the exit door solid forever, so nothing can path
  OUTSIDE. That is right for creatures — they should not follow you out —
  but it means reaching the exit has to be waypointed by hand.

### Persona was missing from the hosted build entirely

The build a judge actually opens showed **BEGIN**, not "PROVE YOU ARE
ALIVE". `livenessConfigured()` was false there, because the two
publishable Persona ids were never set in CI — `gh variable list` and
`gh secret list` were both empty. The deploy workflow already referenced
`vars.VITE_PERSONA_TEMPLATE_ID` and `vars.VITE_PERSONA_ENVIRONMENT_ID`
correctly; nothing had ever been put in them.

So the sponsor challenge with **zero prior art at any hackathon** — the
one with the best odds on the board — was invisible to anyone following
the link.

Set both as repository *variables* (not secrets, deliberately: they are
publishable by design, Vite inlines them into a public bundle, and
Persona's real protection is the dashboard domain allowlist), redeployed,
and confirmed on the live site:

- the gate now reads **PROVE YOU ARE ALIVE**
- clicking it opens the Persona flow from `leozh0u.github.io`, so the
  domain allowlist is correct
- the environment is **Sandbox**, with a "Pass verifications" toggle —
  which is exactly right for judging: anyone can complete the flow
  without entering real identity documents

Also confirmed the hosted build plays: the corridor renders, the HUD and
vitals panel work, MediaPipe loads from CDN (`FACE tracked`), and the
pulse falls back correctly with `LINK local only`, since there is no
sidecar behind a static site.

---

## LEDGER RECONCILIATION — every request this session

Checked back against his actual words, not against what felt done.

| # | Asked, in his words | State |
|---|---|---|
| 1 | "the monsters were still very bland, no details" (4x) | heads, staining, eyes, exposure — **not signed off by him** |
| 2 | trackpad "rotate rather than pan" → "everything is upside down" | degenerate case fixed + self-righting; **full flip never reproduced** |
| 3 | "can you get the presage to work" | pipeline proven end to end; **blocked on his camera** |
| 4 | "the walking animation of the monsters phases through the walls" | clearance-aware nav shipped; **never visually verified** |
| 5 | "more sudden scary movements" | done — lunge cycle + twitch |
| 6 | "the camera also isn't on. atleast theres no green light" | diagnosis shipped; **blocked on him** |
| 7 | "make sure presage works, and the other sponsors do as well" | all four verified; Persona also fixed on the hosted build |
| 8 | "even more dark… monsters move quicker, or more jittery" | done |
| 9 | "plan how to market the product… exposure therapy" | VIDEO.md rewritten to the brief |
| 10a | "more actual detail, like **colours, patterns**" | done — hue correlated with the shading, plus directional striation |
| 10b | "make sure the game and **movements are smoother**" | done — every easing is frame-rate independent now |
| 10c | "and **no phasing bugs** etc" | done — measured: 0.66m → 1.26m clearance on the worst route |
| 11 | "main selling features ready to demo and explain" | VIDEO.md + DEVPOST.md |
| 12 | 66 Claude co-author trailers | **blocked on him** |
| 13 | four exposed API keys to rotate | **blocked on him** |
| 14 | MathWorks, ~30 seconds of his time | **blocked on him** |

**Three items were quietly not done.** 10a, 10b and 10c all arrived in one
message while I was mid-edit on something else, and only the parts that
matched what I was already doing — texture and eyes — actually got built.
Colour, smoothness and phasing verification were never touched. Working
them now, oldest first.

---

## Monster animation states (Leo: "monsters are really important")

Asked for: animations for when it tracks you, runs at you, and tries to
kill you.

There was no animation state at all — just `hunting`, `attacking` and
`closeness`. A boolean about pursuit and a distance don't tell a body how
to hold itself, so all three creatures played one walk cycle with a couple
of parameters nudged, and noticing you, closing on you and trying to kill
you all looked like walking. The moments that matter most in a horror game
were the ones with no animation of their own.

`EntityState` now carries a verb — `patrol / alert / stalk / charge /
strike` — plus a one-shot clock, a coil amount and a strike amount.
Derived in Entity.tsx, where alertness and the lunge cycle already live,
so the creature receives a verb rather than a pile of flags.

Whole-body pose is applied in Entity.tsx so all three share it, and it is
what carries at distance: long before you can make out a skull you can
read whether the shape at the end of the corridor is ambling, has stopped
and risen, or is coming at you leaning forward. It rides on top of each
creature's own walk cycle rather than replacing it.

Per creature:
- **Crawler** — alert rears the front pair and widens the stance, the head
  sway stops dead and snaps level, the jaw gapes; coil gathers the legs
  under it; strike lifts the front legs and thrusts the skull forward
- **Smile** — its arms were untouched since the project started. Idle
  twitching is now suppressed as it commits (a thing that keeps fidgeting
  while it comes for you doesn't look like it means it), alternate arms
  throw opposite ways so the span nearly doubles on alert, gather tight on
  coil, and are thrown wide on the strike
- **Tall one** — has no face to change, so its beat is *stopping*: the
  sway ends and the head locks square on. Its head is also the only part
  visible at range, so it flares on acquisition — the far-away version of
  a head snapping round

### Verified / not verified

Rendering and the pose blending are confirmed by screenshot, and
`patrol` / `stalk` were observed cycling live. `alert`, `charge` and
`strike` were NOT observed in that sample — the creatures never got line
of sight at close range during it. Verifying those next.

---

## Live debugging session — Leo actually playing

### His camera works. Presage was reading him.

The log caught it mid-session:

```
status=kRunning — 26 frames in: sit back so your upper chest is in frame too
sdk error 1 SmartSpectra is not in a valid state for this operation. retryable=false
processing status: kError
```

Presage had his face and was giving real framing feedback. Then the graph
dropped into `kError`, where it refuses every frame **forever**, and the
sidecar's only response was to log that refusal once per frame at 24fps,
indefinitely. From the game's side: `reading…` for the rest of the
session, indistinguishable from a signal that has not converged.

The SDK exposes stop/reset/start, so it now uses them — debounced,
because errors arrive per-frame, and capped at five, because something
that fails immediately on every restart will not be fixed by restarting
it a hundred more times.

Also fixed before that: a paused tab produced a multi-minute forward jump
in frame timestamps, which the SDK refuses with "gap between camera frame
timestamps". The sidecar now keeps its own clock and clamps the delta, so
a pause of any length becomes one ordinary frame interval. This matters
more than it sounds — he said he would be doing other things in Chrome
with the game in a background tab.

### "why does it say 40bpm, 40 feels too low"

Because 40 was the bottom of the band and the estimator was railing
against it. Reproduced: a signal of nothing but leaning and breathing,
no pulse anywhere, returns **40 bpm at confidence 1.00**. Breathing is
12–20/min and sway is slower; their energy sits below the band, and a
windowed DFT leaks into the bottom bin.

Three fixes — a running-mean high-pass at ~0.77 Hz, an edge guard, and
harmonic rejection (a head bob at 18/min puts its third harmonic at 54,
which is a perfectly plausible resting rate). Verified in both
directions, since any of them could pass by rejecting everything: sway,
breathing, walking bob and fidgeting all return null; 55 resting, 72
under heavy sway, 76 through breathing and 130 frightened are all found.

And the display was crawling — the step clamp limited the INPUT to the
moving average, which then applied alpha of that, so the two multiplied
to 0.6 bpm per reading. Plus the first reading anchored everything, and
the first reading is the least reliable one there is.

### The light he asked about

A fragment. One of three. The light follows the nearest uncollected one,
so picking one up moves the light away and the room goes dark — which
read as "did I just end the game".

### Audio

The jump sound was a 150ms white-noise burst through a fixed high-pass,
opened at full gain: an instant attack on noise is a click, a static
high-pass is a hiss, and there was no low end connecting it to a body.
Rebuilt as a scuff plus the weight leaving the floor, randomised per
jump. It was also firing in the same frame as the landing thud when the
key was held through a touchdown.

The same instant-attack click was in the footsteps and the landing — the
two most frequently triggered sounds in the game. Fixed there too, and
deliberately NOT in the jump-scare stabs, where an instant attack is the
entire point.

---

## LEDGER — reconciled again

| Asked, in his words | State |
|---|---|
| "monsters were still very bland" (raised 4x) | heads, colour, texture, eyes, poses — **never signed off by him** |
| "add more animations… tracks you, runs towards you, tries to kill you" | done, tested |
| "the jumping sound sounds bad" | done |
| "why does it say 40bpm… feels too low" | done — it was his breathing |
| "how do i make presage work" | **his camera works; SDK recovery shipped; needs him to sit back** |
| "is that the finish? is there even a finish?" | answered — fragment, 1 of 3, two endings |
| trackpad "everything is upside down" | **edge case fixed, full flip NEVER REPRODUCED** |
| Persona | dropped, at his call — a healthcare team will use it better |
| MathWorks, ~30s of his time | **blocked on him** |
| rotate 4 exposed API keys | **blocked on him** |
| 66 Claude co-author trailers in a public repo | **blocked on him** |

### Acting on the oldest actionable item next

Blind mode latches for the whole session once the 25s watchdog fires, and
Leo's runs are starting before his camera is ready — so a run gets a fake
baseline of 72 and keeps it even after Presage starts delivering real
readings. Every Director comparison in that run is then against a number
that was never his. That is the thing most likely to make the biometrics
feel like they are not working, even once they are.
