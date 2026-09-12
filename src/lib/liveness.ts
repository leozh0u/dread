/**
 * Persona identity verification — "prove you're alive to enter."
 *
 * DREAD's whole premise is that the house reads a living nervous system.
 * So the door asks for two different proofs: Persona confirms a real
 * human is there, and Presage then confirms that human has a pulse.
 *
 * WHAT IS AND ISN'T SECRET (this is the bit that's easy to get wrong):
 *   VITE_PERSONA_TEMPLATE_ID    — publishable, ships in the bundle
 *   VITE_PERSONA_ENVIRONMENT_ID — publishable, ships in the bundle
 *   PERSONA_API_KEY             — SECRET. Never VITE_-prefixed, never
 *                                 imported here. Only the sidecar reads it.
 * Vite only exposes VITE_-prefixed variables to client code, so the API
 * key physically cannot reach the browser through this path. DREAD is a
 * static site: anything in the bundle is public, permanently.
 *
 * Persona's actual browser-side protection is the domain allowlist in the
 * dashboard, not secrecy of the template id — add the github.io origin
 * there, or anyone can run inquiries against the template.
 *
 * DEGRADATION IS DELIBERATE. If the IDs aren't configured, or the SDK
 * fails to load, or the network is down, this resolves to 'unavailable'
 * and the game starts anyway. A judge who cannot get past a verification
 * screen cannot play the game at all, and the standing rule for this
 * build is to drop an unreliable capability rather than let it fail in
 * front of someone.
 */

export type LivenessResult =
  | { status: 'verified'; inquiryId: string; serverVerified: boolean }
  | { status: 'declined' }
  | { status: 'unavailable'; reason: string }

const TEMPLATE_ID = import.meta.env.VITE_PERSONA_TEMPLATE_ID as string | undefined
const ENVIRONMENT_ID = import.meta.env.VITE_PERSONA_ENVIRONMENT_ID as string | undefined

/** Whether to show the verification step at all. */
export function livenessConfigured() {
  return Boolean(TEMPLATE_ID && ENVIRONMENT_ID)
}

/**
 * Ask the sidecar to confirm the inquiry really passed.
 *
 * The browser's onComplete status is client-reported, so in a static site
 * it's trivially spoofable — anyone can call the callback by hand. Only a
 * server holding the API key can actually confirm an inquiry. The sidecar
 * does that when it's running; when it isn't (a judge on the hosted
 * build), we say so honestly rather than claiming a verification we
 * didn't perform.
 */
async function confirmWithSidecar(inquiryId: string): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:8787/verify-inquiry?id=${encodeURIComponent(inquiryId)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { verified?: boolean }
    return body.verified === true
  } catch {
    return false // sidecar not running; not a failure of the inquiry
  }
}

export async function runLivenessCheck(): Promise<LivenessResult> {
  if (!TEMPLATE_ID || !ENVIRONMENT_ID) {
    return { status: 'unavailable', reason: 'not configured' }
  }

  let Persona: typeof import('persona')
  try {
    // Dynamically imported so it code-splits: if this chunk fails to load,
    // the start screen is already rendered and still works.
    Persona = await import('persona')
  } catch {
    return { status: 'unavailable', reason: 'verification SDK failed to load' }
  }

  return new Promise<LivenessResult>((resolve) => {
    let settled = false
    const done = (r: LivenessResult) => {
      if (settled) return
      settled = true
      resolve(r)
    }

    // Never leave the player staring at a dead modal. If Persona hasn't
    // reported anything in two minutes, let them into the game.
    const timeout = setTimeout(
      () => done({ status: 'unavailable', reason: 'verification timed out' }),
      120_000,
    )

    try {
      const client = new Persona.Client({
        templateId: TEMPLATE_ID,
        environmentId: ENVIRONMENT_ID,
        onReady: () => client.open(),
        onComplete: async ({ inquiryId }: { inquiryId: string }) => {
          clearTimeout(timeout)
          const serverVerified = await confirmWithSidecar(inquiryId)
          done({ status: 'verified', inquiryId, serverVerified })
        },
        onCancel: () => {
          clearTimeout(timeout)
          done({ status: 'declined' })
        },
        onError: (error: unknown) => {
          clearTimeout(timeout)
          done({ status: 'unavailable', reason: String(error) })
        },
      })
    } catch (err) {
      clearTimeout(timeout)
      done({ status: 'unavailable', reason: String(err) })
    }
  })
}
