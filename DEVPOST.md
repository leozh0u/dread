# DREAD — Devpost submission copy

Paste-ready. Each heading maps to a Devpost field. Written to be read by a
judge with forty of these open, so the first line of every section carries
the point.

**Before submitting, tick every one of these:** Games & Gamification track,
Presage, Persona, MathWorks, ElevenLabs (×2), Backboard, Tiger Data,
Gemini, Vultr, GoDaddy, Notability. Sponsor challenges are
track-independent — declaring Games costs nothing.

**Mark the YouTube video "Not for Kids"** or judges cannot view it.

---

## Tagline

Every horror game escalates on a script. This one escalates on your pulse.

---

## Inspiration

Horror games are on rails. The monster appears at the same corner every
time, because the designer decided it should, and by your second run
you're not frightened — you're just waiting.

The thing that actually makes horror work is the *gap* between scares, and
no game can time that gap well because no game knows whether you've
recovered yet. A clinician running graded exposure therapy does know: they
watch the person and hold them at the edge of what they can tolerate, not
past it.

So we gave the game the same information. Not a wearable, not a chest
strap — the webcam already on the laptop.

## What it does

DREAD reads your heart rate off your face through the camera, using
remote photoplethysmography, and a Director uses it to decide what the
monster does next.

**Calm, and it comes closer.** Footsteps in the next corridor. Something at
the edge of the flashlight.

**Frightened, and it withdraws.** The room drops to near-silence. It isn't
being merciful — it's waiting for you to come down, because a scare lands
hardest after you've been allowed to recover.

Underneath that, a multi-armed bandit learns which *kind* of scare works on
you specifically — proximity, audio, visual, or dead silence — by measuring
what each one did to your pulse. And because those statistics are
persisted, it still knows tomorrow. Second run, the house opens with
whatever worked on you last time, and tells you so: *"The house has met you
three times. It remembers the audio."*

You're escaping a maze. Find three fragments, open the door. Three
creatures patrol it, hunt you by sight and by sound, and can be hidden from
— if you're quiet. There are two endings: run for the door, or find the
calm room and lower your own heart rate to open the last one. That second
ending is the thesis of the project made playable: the only way out is to
regulate yourself.

## How we built it

A static site — React, TypeScript, Three.js via React Three Fiber, Rapier
for physics. It runs in a browser tab with no install.

**The two clocks.** This is the core engineering constraint of the whole
project, and it dictated the architecture.

| Signal | Latency | What it's good for |
|---|---|---|
| Pulse (Presage) | ~12s average | Is this person actually frightened |
| Facial startle | 100–300ms | Did that just land |

They fail in *opposite places*, which is the whole reason we need both:
rPPG is corrupted by motion, and the player moves most at exactly the
moment a scare lands — so pulse confidence collapses precisely when the
measurement matters. The face doesn't care that you moved.

So: judge the person on the pulse, judge the scare on the face, and when
pulse confidence collapses, lean on the face. A scare that produced a
garbage 140bpm reading and a real flinch is scored off the flinch, so the
bandit never learns from noise.

**Audio does most of the work.** Everything is spatialised through HRTF
panners with convolution reverb, and occlusion is *geometric* — the same
pathfinding that drives the monsters traces the walls, so a creature behind
a wall is dull and unplaceable and the instant it steps into your corridor
the sound snaps into focus. That transition is the scare.

**Monsters navigate for real.** A breadth-first distance field computed
from the player, which all three creatures walk downhill on — one search
shared rather than three per frame, and no local minima to get stuck in at
corners. They hunt on sight (blocked by actual walls), on sound (through
walls, longer range), or when the Director commits to a strike.

## Challenges we ran into

**The pulse sensor produced nothing for hours, silently.** The sidecar
opened the camera, logged some warnings about not being able to lock focus,
and then delivered zero frames — no error, no crash. It turned out a Node
process launched from a terminal has no macOS camera grant, and AVFoundation
fails that by handing you nothing rather than by failing. The fix was to
have the browser — which already holds the camera and already has
permission — push frames over a WebSocket instead, so there's one camera
owner instead of two processes contending for a device only one of them can
open.

Underneath that was a second bug that would have produced the identical
symptom on its own: the metrics payload is protobuf and was never decoded,
so the code read fields off a raw buffer and got undefined forever. Two
faults with one symptom, each hiding the other.

**Everything failed invisibly.** That's the real lesson. A dead camera, a
face model that didn't load, and a pulse that hadn't converged yet were all
the same experience: a number that didn't move. We built a live panel
showing exactly what the sensing stack can see — camera, face, eyes, pulse,
confidence, startle — and found three more bugs within minutes of it
existing.

**The first playthrough was brutal.** Every wall in the level floated 0.9
units above the floor, because the floor's top face is at y=-0.9 and the
walls were authored as though it were at zero. The monsters could never
reach the player at all — they were locked to a patrol line and only moved
to where the player *projected* onto it, so standing in any room made you
unreachable. Both are the kind of bug that is invisible in code review and
obvious in the first ten seconds of play.

## Accomplishments we're proud of

The game is **verified, not hoped**. There's a test suite of ~130 checks
that runs without a renderer: it flood-fills the real collision geometry to
prove the level can be finished, walks a full playthrough to both endings,
simulates monster chases and asserts they never occupy solid geometry,
checks that the death rules are *fair* (2.6s when caught in the open, and
hiding quietly is genuinely safe), asserts a chase is winnable by comparing
monster speed to the player's, and refuses to build if a secret would reach
the browser bundle.

That suite caught two sealed rooms that also opened holes into the void
outside the level, and it caught them before a player did.

## What we learned

Sensing that fails silently is worse than sensing that fails loudly. Every
serious bug in this project shared the property that the broken state and
the working-but-not-yet state looked identical. The single highest-leverage
thing we built was the readout that told us which was which.

## What's next

Wire heart-rate *variability* through as well as heart rate — the model
already accepts it and currently runs on HR deviation alone.

## A limitation we want to name

Remote photoplethysmography reads colour change in skin, and its published
accuracy is **not uniform across skin tones** — error rates are higher for
darker skin, because there is less light returned to measure. That's a
known limitation of the entire sensing category, not of our implementation,
and it means this game currently works better for some people than others.

We handle it two ways: confidence is treated as a first-class signal rather
than assumed, and the facial-startle channel is motion- and tone-tolerant
in ways the pulse channel isn't, so the game degrades toward it. We're
naming it because a system that reads bodies should say whose bodies it
reads well.

---

# Sponsor challenges

## Presage — core mechanic

The entire game is a control loop around SmartSpectra's pulse output. The
Director's phase transitions are driven by heart rate against a
per-player calibrated baseline, measured over a 60-second sit-still opening
that we turned into the cold open rather than hiding as a loading screen.

We treat `confidence` as a real signal, not a number to ignore: when it
collapses — which happens *because* the player jumped — the Director stops
trusting the pulse for that scare and scores it off the face instead.

Browser captures frames and pushes them to a local SmartSpectra process over
a WebSocket; RGBA straight from the canvas so the conversion happens in C++
rather than on the thread rendering the game, at 480×360/24fps with
backpressure and monotonic timestamps.

## Persona — "prove you're alive to enter"

Two different proofs of life, which is exactly this game's premise: Persona
confirms a real human is there, and Presage then confirms that human has a
pulse. The house won't open for anything else.

The embedded flow runs client-side with the publishable template and
environment ids; the API key never leaves the local server, which
independently confirms the returned inquiry — the browser's completion
callback is client-reported and trivially forged on a static site, so a
verification nobody checked isn't a verification. Where the server can't
confirm, the UI says so rather than claiming one.

## MathWorks — a solved model, not a live call

`matlab/autonomic_model.m` models sympathetic/parasympathetic balance from
heart rate and HRV, and exports the solved surface as a lookup table the
game interpolates at runtime (57×66 grid, bilinear).

It's a table rather than a live call **on purpose**: the game is a static
site running at 60fps in a browser, it cannot call MATLAB, and it must not
depend on anything that can fail during a live demo. Solving offline and
shipping the result is the standard way to get a MATLAB-designed controller
onto a realtime target, and it's the only honest way to claim the model is
doing real work — it's in the decision path on every phase transition.

## ElevenLabs — horror is an audio medium

Every creature vocalisation, every footfall, and the house's own voice are
generated with ElevenLabs and played back through a spatial graph: HRTF
panners, convolution reverb from a procedurally generated impulse response,
and geometric occlusion.

Generated **offline** by a script, with only the resulting audio committed —
a static site cannot hold an API key, and this is the one architecture where
that constraint costs nothing.

The three creatures are deliberately distinguishable with your eyes shut,
because most of this game is played by ear.

## Backboard — the house remembers you

The Director's bandit statistics — which scare type produces the biggest
pulse response in *this* player — are persisted between sessions and read
back on load, so the house opens a second run with whatever worked on you
the first time, and says so.

Stored as prose with a structured tail, because retrieval is semantic: the
sentence makes it findable, the JSON makes it usable. Everything read back
is treated as untrusted input and guarded field by field.

## Tiger Data — the pulse trace, as the time series it is

A heart rate sampled once a second with Director events marked against it
is a time series in the textbook sense, stored in a hypertable doing the
one thing hypertables are for. It makes a run outlive the tab: the end
screen closes on how tonight compared to the last time you played —
*"It got 8 bpm further into you than last time. You also sat down calmer."*

## Ken Kennedy / Responsible AI

See "A limitation we want to name" above. We disclose the rPPG skin-tone
accuracy disparity as a known property of the sensing category, treat
confidence as a first-class signal rather than assuming it, and degrade
toward the channel that's more tolerant when the primary one fails.
