# DREAD — demo video plan

**Brief, in Leo's words:** *"I'm not doing a playthrough of the game. I
just need to show snippets of it working, show the main features, explain
how it works, the stack, and the outcome / why it's important regarding
exposure therapy, helping people regulate heart rate etc."*

So this is **not** a let's-play. It is a product demo: short proof
snippets, each one labelled, each one earning a specific claim, with
narration carrying the argument between them.

Target **3:00–3:30**. HackRice prescribes roughly 30s intro / 2min demo /
30s technical / 30s impact; this fits inside that shape without being a
playthrough.

**Mark it "Not for Kids" on YouTube** or judges cannot view it. Upload
unlisted and early, so the link is live and tested long before submission.

---

## The one rule

The artifact is genuinely strange: a browser horror game that reads your
pulse off your webcam and uses it against you. **The strangeness is the
pitch.** No skits, no "imagine a world where", no fake dialogue. Every
claim in the narration is answered by something visibly happening on
screen within two seconds of you saying it.

The one shot you cannot fake or reshoot is **a real face and a real pulse
number in the same unbroken frame at the moment of a scare.** Everything
else is replaceable. Get that first, while you have energy.

---

## Before you record

| | |
|---|---|
| Sidecar running | `node sidecar/server.js` — wait for `backboard=ready tigerdata=ready` |
| Lamp | One desk lamp on your face. It is in-fiction (the game tells you to face the light) AND it is what Presage needs. Shoot it as staging, not as a compromise. |
| Camera allowed | The start screen will tell you if it isn't. Do not record until the vitals panel shows `CAMERA live`. |
| Headphones | Not for the recording — for you. Audio is spatial; you need to hear what you're describing. |
| Screen capture | 1280×800 or 16:9. **Do not record in a short window** — and check the vitals panel isn't clipped. |
| Facecam inset | Small, bottom-right, always visible during snippets. The face is half of every claim. |
| Dev keys | `C` skip calibration · `K` grant all fragments · `J` both. Use them between takes so you're never waiting 60 seconds on camera. |

Record every snippet **twice**. The second take is always tighter.

---

## Shot list

### 1 · Cold open — 0:00–0:20

No title card. No logo. Start on the thing itself.

| # | Shot | Notes |
|---|---|---|
| 1 | Your face in the dark, lit by the one lamp. Pulse number overlaid, steady. | Hold ~4 seconds. The stillness is what sells the spike. |
| 2 | **The spike.** A real scare, a real flinch, the number visibly jumping. | ONE CONTINUOUS TAKE with face and number in frame together. Never cut between them — the cut is what would make it look staged. |
| 3 | Cut to black. Title: **DREAD**. | Only after the spike has landed. |

> **VO (over 1–2):** "This is a horror game. It's reading my heart rate
> through the webcam — no wearable, no hardware. And when I calm down,
> it comes closer."

Stop talking there. Two sentences is the whole premise.

### 2 · The inversion — 0:20–0:40

The single idea that makes this different from every other horror game.

| # | Shot | Notes |
|---|---|---|
| 4 | Vitals panel, pulse dropping back toward baseline, and the Director's phase flipping `WITHDRAW → STALK` | This is the mechanic, visible as text. Let it sit long enough to read. |
| 5 | A creature stepping out of the dark toward you | Cut on the movement |

> **VO:** "Every horror game escalates on a script. This one is adversarial
> to your nervous system. Scared, and it backs off and lets you recover.
> Calm, and it starts closing in — because a scare lands hardest after
> you've been allowed to relax."

### 3 · Feature snippets — 0:40–2:05

Six snippets, 10–15 seconds each. Each one is a claim and its proof. Put
a **small label in the corner** for each so a judge skimming can follow.

| # | Label on screen | What to capture | The claim it earns |
|---|---|---|---|
| 6 | **LIVE PULSE** | Vitals panel: `CAMERA live`, `LINK presage`, `FACE tracked`, a bpm number moving, confidence bar filling | The biometrics are real, live, and from the webcam alone |
| 7 | **IT SEES YOU BLINK** | Close your eyes on camera → `EYES closed` flips in the panel, and a whisper answers | Two independent sensing channels, not one |
| 8 | **THE DIRECTOR** | Phase readout cycling `STALK → STRIKE → WITHDRAW` next to the pulse trace | The AI director is driven by measured arousal, not a timer |
| 9 | **IT HUNTS** | A creature coiling, snapping its head to you, and lunging | It navigates the real maze and commits to an attack |
| 10 | **HIDE** | Step into the wardrobe, `exposed` flips to `hidden`, the creature passes | There is counterplay; it's a game, not a jumpscare reel |
| 11 | **CALM YOURSELF OUT** | The calm room: the band indicator, your bpm settling inside baseline ±5, the door opening after 8 seconds held | **The most important snippet in the video.** See below. |

Snippet 11 is the one that carries the impact section, so shoot it
properly: get your heart rate genuinely up first (play for real for a
minute), then walk into the calm room and actually breathe it down on
camera. The breathing pacer is on screen to help. **That is the whole
thesis in one shot** — the game ends because you regulated yourself.

### 4 · How it works and the stack — 2:05–2:45

Screen-record the architecture while you narrate. Keep it concrete.

> **VO:** "The pulse comes from Presage's SmartSpectra SDK, running in a
> local sidecar — the browser captures frames and streams them over a
> websocket, because the whole game is a static site and the API key can
> never touch it. Presage gives a pulse rate averaged over twelve seconds,
> which is far too slow for a jump scare. So there are two clocks: the
> slow one, pulse and heart-rate variability, drives the Director's
> decisions. A fast one — MediaPipe face landmarks, blinks and startle,
> running in the browser at frame rate — catches the flinch. They fail in
> opposite places, which is exactly why there are two.
>
> The game is React Three Fiber and Rapier. The creatures path on a
> shared breadth-first distance field, so all three navigate one real
> maze. The house remembers you between
> runs through Backboard, and it learns which kind of scare works on you
> specifically. Every heartbeat is written to Tiger Data as time-series,
> which is what draws your fear curve at the end."

Show, in order, as you say each: the sidecar terminal → the vitals panel
→ the maze from above (press `M`) → "the house has met you N times" →
the fear curve.

### 5 · Why it matters — 2:45–3:15

This is the section Leo asked for and the one most likely to win
something. **Be accurate.** Overclaiming a medical benefit is the fastest
way to lose a judge who knows the field.

> **VO:** "Two real things meet here. Graded exposure — controlled,
> repeated contact with something frightening — is the standard
> evidence-based treatment for phobia and anxiety. And heart-rate
> biofeedback, learning to bring your own arousal down by watching it, is
> used for anxiety regulation today. Both depend on the same thing:
> knowing the person's actual arousal, and adjusting what you expose them
> to based on it.
>
> That's the loop this game already runs. It measures arousal, escalates
> when you habituate, backs off when you're overwhelmed, and its second
> ending can only be reached by deliberately calming yourself down. We
> built it to be frightening — but the control loop underneath is the one
> exposure therapy uses, and it runs on a laptop webcam with nothing
> strapped to you.
>
> It isn't a clinical tool and we haven't tested it as one. What it shows
> is that the hardware barrier is gone."

**Say that last line.** The honest limitation is what makes the rest
credible, and Ken Kennedy-style responsible-computing judges reward it
explicitly. Same reason to mention, if asked, that camera-based pulse
estimation is known to be less accurate on darker skin tones — naming a
real limitation of your own stack is a strength in that room.

### 6 · Close — 3:15–3:30

| # | Shot |
|---|---|
| 12 | The fear curve, full screen, with scare events marked along it |
| 13 | The hosted URL on screen, held for 3 seconds |

> **VO:** "It runs in a browser. Open it, allow the camera, and it starts
> reading you in about a minute."

---

## Snippet capture cheat-sheet

Per snippet, so you're not remembering this at 1am:

- **Live pulse** — sit still, face the lamp, let the confidence bar fill.
  If the panel shows a red box, it is telling you exactly what's wrong;
  fix that first.
- **Blink** — close your eyes for a full second. Don't blink normally,
  it's too fast to see on video.
- **Director** — press `C` to skip calibration, then just play. The phase
  readout is top-left under the bpm.
- **Hunt** — press `J`, walk into an open corridor, and let one find you.
  Film the approach, not the death.
- **Hide** — the wardrobe near spawn. Watch `exposed` flip to `hidden`.
- **Calm room** — press `K` so the door is already unlocked, take the
  southern fork rather than the exit door. Get your pulse up first or the
  shot proves nothing.
- **Fear curve** — any completed run. A longer run makes a better curve.

## What NOT to put in the video

- Anything that only works sometimes. Cut it entirely rather than show it
  failing — judges never penalise scope you didn't claim, and they always
  notice a demo dodging its own feature.
- The dev keys. Use them, don't film them.
- Long stretches of walking. Every snippet should be moving toward a
  claim.
