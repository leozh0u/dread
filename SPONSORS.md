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
   `senseishiba666.github.io` (plus `localhost` for dev).
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

For the hosted build, the two `VITE_` ids also need to be set in the
GitHub Actions workflow (they're public, so they can be plain `vars`, not
secrets). Tell me when you have them and I'll wire that up.

---

## Backboard — code is DONE, needs 2 values from you

"The house remembers you between sessions." Backboard has **no publishable
key**, so every call is proxied through the sidecar — meaning memory works
on your laptop and in the video, but not on the hosted build for judges.
That's a hard constraint of their API, not a choice.

You need an assistant id first:

```bash
cd /Users/leo/Projects/dread && source .env.local 2>/dev/null; curl -s -X POST https://app.backboard.io/api/assistants -H "X-API-Key: $BACKBOARD_API_KEY" -H "content-type: application/json" -d '{"name":"DREAD House","system_prompt":"You remember what frightens each player."}'
```

Take the `assistant_id` from the response and:

```bash
cd /Users/leo/Projects/dread && cat >> .env.local <<'ENV'
BACKBOARD_API_KEY=your_key
BACKBOARD_ASSISTANT_ID=the_uuid_from_above
ENV
```

Sidecar endpoints already live: `POST /memory/remember`, `GET
/memory/recall?q=…`. The game does not yet *call* them — that's the next
piece of work, and it's the part that makes the story real: on a second
run the house leads with whatever spiked you last time.

---

## Tiger Data — decision, not code

The pulse trace is time-series by definition, so it's a natural fit. But a
static site can't hold DB credentials, so it would have to go through the
sidecar like Backboard. Same constraint, less payoff than the other two,
and the fear curve already works locally without it.

**Recommendation: do this last, or not at all.** It's the weakest of the
three and the deadline is Sunday 09:00.

---

## MathWorks

`matlab/autonomic_model.m` is written and the game already runs without it
via a documented fallback. One command from you when you have Simulink
open; see PROGRESS.md.

## ElevenLabs

Done. Audio is generated offline by `scripts/generate-audio.mjs` and only
the resulting MP3s are committed, so no key ever reaches the browser.
