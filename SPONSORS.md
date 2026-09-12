# Sponsor integrations — what's wired, and what Leo still has to do

## The one rule

DREAD is a **static site**. Anything in the browser bundle is public
forever — a judge can read it, and so can anyone else. So secrets live in
`.env.local` (gitignored, verified untracked) and are read **only** by the
sidecar, which runs on your laptop.

Vite enforces this mechanically: it exposes a variable to client code
**only** if the name starts with `VITE_`. So the naming below is not a
convention, it's the security boundary.

| Variable | Ships to browser? | Why |
|---|---|---|
| `VITE_PERSONA_TEMPLATE_ID` | **yes** | publishable by design |
| `VITE_PERSONA_ENVIRONMENT_ID` | **yes** | publishable by design |
| `PERSONA_API_KEY` | no | can confirm inquiries — secret |
| `BACKBOARD_API_KEY` | no | no publishable key exists at all |
| `PRESAGE_API_KEY` | no | sidecar only |
| `ELEVENLABS_API_KEY` | no | offline audio generation only |

**Never paste a key into chat.** Append them to `.env.local` in a terminal.

---

## Presage — DONE, needs one confirmation from you

Run the sidecar, open the game, and watch for a BPM. See PROGRESS.md item 2
for the root cause writeup.

```bash
cd /Users/leo/Projects/dread/sidecar && npm start
```

The sidecar now tells you exactly what's wrong if it can't read you —
"TOO DARK — put a lamp on your face", "lean closer", "sit back so your
upper chest is in frame". If it says **NO FRAMES arriving**, the game
isn't open or the camera wasn't allowed.

---

## Persona — code is DONE, needs 3 values from you

This is the highest-value sponsor: **no prior art at any hackathon**, and
"access depends on a verified human" is literally DREAD's premise.

1. Sign in at [withpersona.com](https://withpersona.com) and make sure you
   are in the **Sandbox** environment (it needs no real ID document — name
   fields are always overwritten to "Alexander J Sample", and it's free).
2. Create an Inquiry **template**. Copy its `itmpl_…` id.
3. From Settings, copy the Sandbox **environment id** (`env_…`) and an
   **API key**.
4. Add the domain allowlist entry for the hosted build — this is the only
   thing stopping a stranger running inquiries against your template:
   `leozh0u.github.io` (plus `localhost` for dev).
5. Then:

```bash
cd /Users/leo/Projects/dread && cat >> .env.local <<'ENV'
VITE_PERSONA_TEMPLATE_ID=itmpl_your_id
VITE_PERSONA_ENVIRONMENT_ID=env_your_sandbox_id
PERSONA_API_KEY=your_secret_key
ENV
```

Until those exist the start screen just says BEGIN, exactly as now — the
gate only appears once it's configured, so nothing can break by not doing
this.

Once configured, the start screen offers **PROVE YOU ARE ALIVE**, with a
small always-visible "skip — just let me in". The skip is deliberate: a
judge who can't get past a verification screen can't play the game at all.

For the hosted build, the workflow already reads the two publishable ids
from repository **variables** — you just need to set them once:

```bash
cd /Users/leo/Projects/dread && gh variable set VITE_PERSONA_TEMPLATE_ID && gh variable set VITE_PERSONA_ENVIRONMENT_ID
```

It prompts for each value, so nothing lands in your shell history.

**Do not put `PERSONA_API_KEY` there**, or any other key. Vite inlines
every `VITE_` value into the bundle and this is a public static site.

---

## Backboard — code is DONE, needs 2 values from you

"The house remembers you between sessions." Backboard has **no publishable
key**, so every call is proxied through the sidecar — meaning memory works
on your laptop and in the video, but not on the hosted build for judges.
That's a hard constraint of their API, not a choice.

Memories are scoped to an *assistant*, so you need an assistant id as well
as the key. Add the key:

```bash
cd /Users/leo/Projects/dread && printf 'BACKBOARD_API_KEY=your_key\n' >> .env.local
```

Then let the script make the assistant and write its id back for you:

```bash
cd /Users/leo/Projects/dread && node scripts/setup-backboard.mjs
```

Safe to run twice — if an assistant id is already set it stops rather than
orphaning the existing one and every memory attached to it.

Sidecar endpoints already live: `POST /memory/remember`, `GET
/memory/recall?q=…`. The game does not yet *call* them — that's the next
piece of work, and it's the part that makes the story real: on a second
run the house leads with whatever spiked you last time.

---

## Tiger Data — code is DONE, needs 1 value from you

The pulse trace is a time series in the textbook sense — a heart rate
sampled once a second with events marked against it — so it's stored in a
hypertable doing the thing hypertables are for. It also makes a run
outlive the tab, which the in-memory fear curve doesn't.

**Your connection string contains a password.** It can never go in the
bundle; it's read only by the sidecar. Don't paste it in chat:

```bash
cd /Users/leo/Projects/dread && printf 'TIGERDATA_URL=your_connection_string
' >> .env.local
```

Then restart the sidecar. It prints `tigerdata=ready` on success, or the
exact reason it couldn't connect. The schema creates itself on first
connect — there's no migration step to forget.

Check it's storing:

```bash
curl -s http://localhost:8787/health
```

Same constraint as Backboard: it works on your laptop and in the video,
not on the hosted build for judges, because the credentials can't ship.

---

## MathWorks

`matlab/autonomic_model.m` is written and the game already runs without it
via a documented fallback. One command from you when you have Simulink
open; see PROGRESS.md.

## ElevenLabs

Done. Audio is generated offline by `scripts/generate-audio.mjs` and only
the resulting MP3s are committed, so no key ever reaches the browser.
