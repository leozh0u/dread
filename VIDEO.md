# DREAD — demo video plan

HackRice prescribes 30s intro / 2min demo / 30s technical / 30s impact.
Be cinematic *inside* those beats — Relevance is a scored criterion, so
don't reinvent the structure, just execute it well.

**Mark it "Not for Kids" on YouTube** or judges can't view it. Upload
early, unlisted, so the link is live and tested well before submission.

---

## The one rule for this video

The artifact is genuinely strange — a horror game that reads your pulse
off your webcam and hunts you with it. **The strangeness IS the pitch.**
Both viral precedents for this kind of demo (Dropbox's 2007 screencast,
GibberLink at ElevenLabs' hackathon) are straight demos of a weird real
thing with personality layered on top — never a bit standing in for a
demo. So: no skits, no fake dialogue, no "imagine a world where."
Show a real person, really scared, with their real heartbeat on screen.

**The single most valuable asset is genuine reaction footage.** Film
several different people playing. You cannot fake or reshoot a real
flinch, and that footage is the whole video.

---

## Shot list

### 0:00–0:30 — Intro (cold open, no title card)

| # | Shot | Notes |
|---|---|---|
| 1 | Face in the dark, lit by one lamp, pulse number overlaid | The lamp is in-fiction — Presage needs a well-lit face. Shoot it as horror staging, not as a setup compromise. |
| 2 | Hold on the face. Let the pulse number sit there, steady. | ~4s. The stillness sells the spike that follows. |
| 3 | **The spike.** Real scare, real jump, pulse number visibly jumps. | One continuous take, face and number in the same frame — that's what makes it unfakeable. Do not cut between them. |
| 4 | Title: DREAD | Only after the spike has landed. |

Voiceover over 1–3, short: *"This is a horror game. It's reading his
heartbeat through the webcam. When he calms down, it comes closer."*
That's the whole premise in two sentences — say it and stop talking.

### 0:30–2:30 — Demo

Screen capture with a facecam inset (small, bottom corner, always
visible — the face is half the demo).

| # | Beat | What it proves |
|---|---|---|
| 5 | Calibration: sitting still, HUD reading bpm, "learning what calm looks like on you" | The sensing is real and live |
| 6 | Moving through the corridors, fluorescents flickering, hum | Atmosphere and craft |
| 7 | **Hear it before you see it** — footsteps approaching in stereo, player turns toward the sound | Say out loud: "everything you hear is positioned — he's finding it by ear" |
| 8 | Hiding while it passes. Pulse climbing on the HUD. | Stakes, and the mechanic |
| 9 | **The Director beat** — it backs off as he spikes, then comes back once he settles | THE differentiator. Call it out explicitly in VO: "it just backed off — because his heart rate spiked. It waits for him to recover." |
| 10 | Finding the last fragment, door unlocking, running for the exit | Payoff, and shows there's a real win |

Cut 5–10 tight. Two minutes goes fast; don't let exploration footage
run long. Prioritise 7 and 9 — they're the two things no other
submission will have.

### 2:30–3:00 — Technical

Talking head or VO over b-roll of the code/architecture.

- Presage SmartSpectra reads pulse off the webcam — no wearable, nothing
  strapped to anyone. In-browser rPPG fallback so the demo can never go
  dark (**say this** — judges respect a failsafe).
- MediaPipe face landmarks for eyes-closed detection, client-side.
- The Director: an epsilon-greedy bandit that learns which scare type
  spikes *this specific player* hardest, and uses arousal to decide when
  to push and when to retreat.
- Spatial audio: everything synthesised at runtime — HRTF panning,
  distance-based occlusion, convolution reverb. No audio files.
- **Name the hard part honestly:** motion corrupts an rPPG signal exactly
  when the player flinches — the interesting moment. That's a real
  engineering problem and saying so is stronger than pretending it isn't.

### 3:00–3:30 — Impact

End on the fear curve screen — the real pulse trace with every scare
event marked on it.

Script, roughly: *"Escalate while they're calm, back off when they
spike, return once they've recovered. That push-and-retreat loop is
structurally what a clinician does by eye in graded exposure therapy.
We're not claiming this treats anything — what we're showing is that the
loop, and the sensing behind it, used to need a chest strap. This ran on
the webcam that was already in the laptop."*

**Do not oversell this.** The hedge is not a weakness, it's the reason
the claim is credible at all. Judges punish overreach and reward
calibration.

---

## Production notes

- **Assign a video owner at hour zero.** B-roll of people playing cannot
  be manufactured later.
- **Shoot Saturday evening, not Sunday morning.** Ten hours of slack, not
  one, on a build that works.
- **Cut anything flaky out of the demo entirely** rather than showing it
  fail. Judges never penalise scope you didn't claim; they always notice
  evasion. If Presage isn't stable on the day, film the fallback and say
  it's the fallback.
- Record clean audio separately from screen capture. Laptop mic over
  game audio is the most common way a good hackathon video reads cheap.
- Have the game **already calibrated** before you roll on the demo
  section — nobody wants to watch 60 seconds of calibration.

## Pre-submission checklist

- [ ] Uploaded to YouTube, marked **Not for Kids**, link tested logged-out
- [ ] Under 4 minutes
- [ ] Face and pulse number visible in the same frame at least once
- [ ] The Director backing-off beat is explicitly called out in VO
- [ ] The honest-limitation line is in the technical section
- [ ] Devpost: every sponsor challenge box ticked
- [ ] Live link in the description: https://leozh0u.github.io/dread/
